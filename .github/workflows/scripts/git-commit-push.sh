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

    # Try to merge remote branch
    # Note: --no-edit to avoid prompting for commit message
    if git merge origin/"$CURRENT_BRANCH" -m "Merge remote-tracking branch 'origin/$CURRENT_BRANCH' [skip ci]" --no-edit; then
      echo "Merge successful, retrying push..."
    else
      echo "Merge conflict or error detected. Checking if the conflict is only in the product cache file..."
      
      # Clean index.lock if merge crash left it
      rm -f .git/index.lock

      # Check if the conflict is only in the product cache file
      if git status --porcelain | grep -q "UU data/cache/paapi-product-cache.json"; then
        echo "Conflict detected in data/cache/paapi-product-cache.json. Attempting automatic merge..."
        
        # Check if there are other conflicted files
        OTHER_CONFLICTS=$(git status --porcelain | grep "^UU " | grep -v "data/cache/paapi-product-cache.json" || true)
        if [ -n "$OTHER_CONFLICTS" ]; then
          echo "Merge failed due to multiple conflicting files:"
          echo "$OTHER_CONFLICTS"
          git merge --abort || true
          rm -f .git/index.lock
          exit 1
        fi
        
        echo "No other conflicts found. Extracting ours and theirs versions..."
        git show :2:data/cache/paapi-product-cache.json > data/cache/paapi-product-cache.ours.json 2>/dev/null || true
        git show :3:data/cache/paapi-product-cache.json > data/cache/paapi-product-cache.theirs.json 2>/dev/null || true
        
        echo "Running merge script..."
        if pnpm exec ts-node scripts/merge-product-cache.ts data/cache/paapi-product-cache.ours.json data/cache/paapi-product-cache.theirs.json data/cache/paapi-product-cache.json; then
          echo "Auto-merge succeeded. Staging resolved file..."
          rm -f data/cache/paapi-product-cache.ours.json data/cache/paapi-product-cache.theirs.json
          git add data/cache/paapi-product-cache.json
          
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
          echo "Auto-merge script failed, aborting merge..."
          rm -f data/cache/paapi-product-cache.ours.json data/cache/paapi-product-cache.theirs.json
          git merge --abort || true
          rm -f .git/index.lock
          exit 1
        fi
      else
        echo "Merge failed due to other conflicts or issues, aborting..."
        git merge --abort || true
        rm -f .git/index.lock
        exit 1
      fi
    fi
  fi
done

echo "Push failed after 3 attempts."
exit 1
