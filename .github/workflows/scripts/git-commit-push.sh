#!/bin/bash
set -e

# Usage: ./git-commit-push.sh "commit message" "files to add"
MESSAGE=$1
FILES=${2:-"."}

if [ -z "$MESSAGE" ]; then
  echo "Error: Commit message is required."
  echo "Usage: $0 <commit_message> [files_to_add]"
  exit 1
fi

# Guard 1: Verify git repository and working directory exist
if [[ ! -d ".git" ]]; then
  echo "⚠️ Warning: .git directory not found (checkout not completed or workspace missing). Skipping commit."
  exit 0
fi

# Guard 2: If committing cache files, check directory existence and validate shard JSON integrity
if echo "$FILES" | grep -q "data/cache"; then
  if [[ ! -d "data/cache" ]]; then
    echo "⚠️ Warning: data/cache directory does not exist. Skipping commit."
    exit 0
  fi

  if [[ -d "data/cache/paapi" ]]; then
    echo "Validating shard JSON files in data/cache/paapi..."
    CORRUPT_SHARDS=$(node -e '
      const fs = require("fs");
      const path = require("path");
      const dir = "data/cache/paapi";
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      let corrupt = [];
      for (const f of files) {
        try {
          JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        } catch (e) {
          corrupt.push(f + ": " + e.message);
        }
      }
      if (corrupt.length > 0) {
        console.error(corrupt.join("\n"));
        process.exit(1);
      }
    ' 2>&1 || true)

    if [[ -n "$CORRUPT_SHARDS" ]]; then
      echo "⚠️ Warning: Corrupt cache shard(s) detected in data/cache/paapi. Skipping commit to prevent corruption:"
      echo "$CORRUPT_SHARDS"
      exit 0
    fi
  fi
fi

# Configure git
git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"
# Prevent memory map issues and Bus errors for large files
git config --global core.bigFileThreshold 10m

# Add files
# shellcheck disable=SC2086
git add $FILES

# Check for changes
if git diff --staged --quiet; then
  echo "No changes to commit."
  exit 0
fi

# Commit
git commit -m "$MESSAGE"

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  # If in detached HEAD (like PRs), try to get branch name from environment or rev-parse
  if [ -n "$GITHUB_HEAD_REF" ]; then
    CURRENT_BRANCH=$GITHUB_HEAD_REF
  elif [ -n "$GITHUB_REF_NAME" ]; then
    CURRENT_BRANCH=$GITHUB_REF_NAME
  else
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  fi
fi

if [ "$CURRENT_BRANCH" = "HEAD" ]; then
  echo "Error: Still in detached HEAD. Cannot push safely without a branch name."
  exit 1
fi

echo "Pushing to branch: $CURRENT_BRANCH"

# Retry loop for push
for i in 1 2 3; do
  # Remove stale lock file if it exists from previous attempts or crashed processes
  rm -f .git/index.lock

  if git push origin "$CURRENT_BRANCH"; then
    echo "Push succeeded on attempt $i"
    exit 0
  else
    echo "Push failed on attempt $i, pulling and merging..."
    
    # Clean index.lock before merge operations
    rm -f .git/index.lock

    # Fetch latest remote changes. For shallow repo, fetch with depth first (fast)
    if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
      echo "Fetching recent remote changes for shallow repository (depth=50)..."
      git fetch --depth=50 origin "$CURRENT_BRANCH" || git fetch origin "$CURRENT_BRANCH"
    else
      git fetch origin "$CURRENT_BRANCH"
    fi

    # Reset cache files in working directory to HEAD to avoid "Your local changes..." error on merge
    git checkout HEAD -- data/cache/paapi/*.json 2>/dev/null || true
    git checkout HEAD -- data/cache/paapi-product-cache.json 2>/dev/null || true

    # Try to merge remote branch
    # Note: --no-edit to avoid prompting for commit message
    MERGE_SUCCESS=false
    if git merge origin/"$CURRENT_BRANCH" -m "Merge remote-tracking branch 'origin/$CURRENT_BRANCH' [skip ci]" --no-edit; then
      MERGE_SUCCESS=true
      echo "Merge successful, retrying push..."
    elif [ "$(git rev-parse --is-shallow-repository)" = "true" ] && git status --porcelain | grep -q "^fatal: refusing to merge unrelated histories"; then
      echo "⚠️ Shallow merge failed due to depth limit or unrelated histories. Skipping unshallow to respect cancellation time budget."
    fi

    if [ "$MERGE_SUCCESS" = "false" ]; then
      echo "Merge conflict or error detected. Checking if conflicts are only in cache files..."
      
      # Clean index.lock if merge crash left it
      rm -f .git/index.lock

      # Check conflicted files
      CONFLICTS=$(git status --porcelain | grep "^UU " | awk '{print $2}' || true)
      NON_CACHE_CONFLICTS=$(echo "$CONFLICTS" | grep -v "^data/cache/" || true)

      if [ -n "$NON_CACHE_CONFLICTS" ]; then
        echo "Merge failed due to conflicts outside data/cache/:"
        echo "$NON_CACHE_CONFLICTS"
        git merge --abort || true
        rm -f .git/index.lock
        exit 1
      fi

      if [ -z "$CONFLICTS" ]; then
        echo "No conflicts found, aborting..."
        git merge --abort || true
        rm -f .git/index.lock
        exit 1
      fi

      echo "Conflicts detected only in cache files. Attempting batch automatic merge..."
      
      # Determine fastest runner: compiled JS if available (~0.05s) or fallback to ts-node
      MERGE_CMD=""
      if [ -f "dist/scripts/maintenance/merge-product-cache.js" ]; then
        MERGE_CMD="node dist/scripts/maintenance/merge-product-cache.js"
      else
        MERGE_CMD="pnpm exec ts-node src/scripts/maintenance/merge-product-cache.ts"
      fi

      # shellcheck disable=SC2086
      if $MERGE_CMD --batch $CONFLICTS; then
        echo "Completing merge..."
        rm -f .git/index.lock
        if GIT_EDITOR=true git commit --no-edit; then
          echo "Merge completed successfully. Retrying push..."
        else
          echo "Merge completion failed, aborting..."
          git merge --abort || true
          rm -f .git/index.lock
          exit 1
        fi
      else
        echo "Auto-merge failed, aborting merge..."
        git merge --abort || true
        rm -f .git/index.lock
        exit 1
      fi
    fi
  fi
done

echo "Push failed after 3 attempts."
exit 1
