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
  if git push origin "$CURRENT_BRANCH"; then
    echo "Push succeeded on attempt $i"
    exit 0
  else
    echo "Push failed on attempt $i, pulling with rebase and retrying..."
    
    # Check if shallow
    if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
      echo "Repository is shallow, fetching more history..."
      git fetch --unshallow || git fetch --prune
    fi
    
    # Pull with rebase
    if git pull --rebase --autostash origin "$CURRENT_BRANCH"; then
      echo "Rebase successful, retrying push..."
    else
      echo "Rebase failed, aborting..."
      git rebase --abort || true
      exit 1
    fi
  fi
done

echo "Push failed after 3 attempts."
exit 1
