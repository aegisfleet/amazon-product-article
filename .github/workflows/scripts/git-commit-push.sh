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
    
    # Check if shallow
    if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
      echo "Repository is shallow, fetching more history..."
      git fetch --unshallow || git fetch --prune
    fi
    
    # Clean index.lock before merge operations
    rm -f .git/index.lock

    # Fetch latest remote changes
    git fetch origin "$CURRENT_BRANCH"

    # Reset cache files in working directory to HEAD to avoid "Your local changes..." error on merge
    git checkout HEAD -- data/cache/paapi/*.json 2>/dev/null || true
    git checkout HEAD -- data/cache/paapi-product-cache.json 2>/dev/null || true

    # Try to merge remote branch
    # Note: --no-edit to avoid prompting for commit message
    if git merge origin/"$CURRENT_BRANCH" -m "Merge remote-tracking branch 'origin/$CURRENT_BRANCH' [skip ci]" --no-edit; then
      echo "Merge successful, retrying push..."
    else
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

      echo "Conflicts detected only in cache files. Attempting automatic merge..."
      MERGE_ALL_SUCCESS=true

      for file in $CONFLICTS; do
        echo "Auto-merging conflict in $file..."
        OURS_FILE="${file}.ours.json"
        THEIRS_FILE="${file}.theirs.json"
        git show :2:"$file" > "$OURS_FILE" 2>/dev/null || true
        git show :3:"$file" > "$THEIRS_FILE" 2>/dev/null || true

        if pnpm exec ts-node src/scripts/maintenance/merge-product-cache.ts "$OURS_FILE" "$THEIRS_FILE" "$file"; then
          rm -f "$OURS_FILE" "$THEIRS_FILE"
          git add "$file"
        else
          echo "Failed to merge $file"
          rm -f "$OURS_FILE" "$THEIRS_FILE"
          MERGE_ALL_SUCCESS=false
          break
        fi
      done

      if [ "$MERGE_ALL_SUCCESS" = "true" ]; then
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
