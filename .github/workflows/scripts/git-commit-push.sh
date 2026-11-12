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

# Terminate any leftover generation/maintenance processes from cancelled steps
# to prevent concurrent writes to cache shards during commit & push
pkill -f "article-generation-cli" 2>/dev/null || true
pkill -f "enhance-categories" 2>/dev/null || true
pkill -f "extract-price-drops" 2>/dev/null || true

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

# Get current branch (resolved before the no-change check so we can detect pending pushes)
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

NEEDS_COMMIT=true

# Check for changes
if git diff --staged --quiet; then
  NEEDS_COMMIT=false

  # No new changes in this step, but a commit from a previous step (e.g. an earlier
  # push that failed) may still be unpushed. Push it instead of silently dropping it
  # when the job's workspace is discarded.
  AHEAD_COUNT=$(git rev-list --count "origin/$CURRENT_BRANCH..HEAD" 2>/dev/null || echo "unknown")

  if [ "$AHEAD_COUNT" = "0" ] || [ "$AHEAD_COUNT" = "unknown" ]; then
    echo "No changes to commit."
    exit 0
  fi

  echo "⚠️ No staged changes, but $AHEAD_COUNT unpushed commit(s) detected. Pushing existing commits without creating a new one..."
fi

# Commit
if [ "$NEEDS_COMMIT" = "true" ]; then
  git commit -m "$MESSAGE"
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

    # Reset working tree and index to HEAD to eliminate any local uncommitted changes
    # (e.g. from background processes or cancelled steps) before pulling and merging.
    # Using "git reset --hard HEAD" avoids glob expansion failures with untracked files
    # and guarantees that Git will not abort with "Your local changes would be overwritten by merge".
    git reset --hard HEAD
    git clean -fd data/cache/ 2>/dev/null || true

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
      echo "Merge conflict or error detected. Checking if conflicts are only in auto-mergeable generated data..."

      # Clean index.lock if merge crash left it
      rm -f .git/index.lock

      # Check conflicted files and classify them.
      # - data/cache/**: 商品キャッシュのシャード (タイムスタンプ比較で自動マージ可能)
      # - data/product-categories.json: ASIN別カテゴリ分類ストア (classified_at 比較で自動マージ可能)
      # それ以外がコンフリクトした場合は、データ破損を避けるため手動対応に回す。
      CONFLICTS=$(git diff --name-only --diff-filter=U || true)
      CACHE_CONFLICTS=$(echo "$CONFLICTS" | grep "^data/cache/" || true)
      CATEGORY_CONFLICTS=$(echo "$CONFLICTS" | grep -x "data/product-categories.json" || true)
      OTHER_CONFLICTS=$(echo "$CONFLICTS" | grep -v "^data/cache/" | grep -v -x "data/product-categories.json" || true)

      if [ -n "$OTHER_CONFLICTS" ]; then
        echo "Merge failed due to conflicts outside auto-mergeable generated data:"
        echo "$OTHER_CONFLICTS"
        git merge --abort 2>/dev/null || true
        git reset --hard HEAD
        rm -f .git/index.lock
        exit 1
      fi

      if [ -z "$CONFLICTS" ]; then
        echo "⚠️ Merge failed without identifiable conflict markers. Resetting working tree to HEAD for retry..."
        git merge --abort 2>/dev/null || true
        git reset --hard HEAD
        rm -f .git/index.lock
        if [ "$i" -eq 3 ]; then
          echo "Error: Merge failed on final attempt."
          exit 1
        fi
        sleep 2
        continue
      fi

      echo "Conflicts detected only in auto-mergeable generated data. Attempting automatic merge..."

      # Determine fastest runner: compiled JS if available (~0.05s) or fallback to ts-node
      CACHE_MERGE_CMD=""
      if [ -f "dist/scripts/maintenance/merge-product-cache.js" ]; then
        CACHE_MERGE_CMD="node dist/scripts/maintenance/merge-product-cache.js"
      else
        CACHE_MERGE_CMD="pnpm exec ts-node src/scripts/maintenance/merge-product-cache.ts"
      fi

      CATEGORY_MERGE_CMD=""
      if [ -f "dist/scripts/maintenance/merge-product-categories.js" ]; then
        CATEGORY_MERGE_CMD="node dist/scripts/maintenance/merge-product-categories.js"
      else
        CATEGORY_MERGE_CMD="pnpm exec ts-node src/scripts/maintenance/merge-product-categories.ts"
      fi

      MERGE_FAILED=false

      if [ -n "$CACHE_CONFLICTS" ]; then
        # shellcheck disable=SC2086
        if ! $CACHE_MERGE_CMD --batch $CACHE_CONFLICTS; then
          echo "Cache auto-merge failed."
          MERGE_FAILED=true
        fi
      fi

      if [ "$MERGE_FAILED" = "false" ] && [ -n "$CATEGORY_CONFLICTS" ]; then
        # shellcheck disable=SC2086
        if ! $CATEGORY_MERGE_CMD --batch $CATEGORY_CONFLICTS; then
          echo "Product category auto-merge failed."
          MERGE_FAILED=true
        fi
      fi

      # Verify that every conflict has been resolved before completing the merge
      if [ "$MERGE_FAILED" = "false" ]; then
        UNRESOLVED=$(git diff --name-only --diff-filter=U || true)
        if [ -n "$UNRESOLVED" ]; then
          echo "⚠️ Unresolved conflicts remain after auto-merge:"
          echo "$UNRESOLVED"
          MERGE_FAILED=true
        fi
      fi

      if [ "$MERGE_FAILED" = "false" ]; then
        echo "Completing merge..."
        rm -f .git/index.lock
        if GIT_EDITOR=true git commit --no-edit; then
          echo "Merge completed successfully. Retrying push..."
        else
          echo "Merge completion failed, aborting..."
          git merge --abort 2>/dev/null || true
          git reset --hard HEAD
          rm -f .git/index.lock
          exit 1
        fi
      else
        echo "Auto-merge failed, aborting merge..."
        git merge --abort 2>/dev/null || true
        git reset --hard HEAD
        rm -f .git/index.lock
        exit 1
      fi
    fi
  fi
done

echo "Push failed after 3 attempts."
exit 1
