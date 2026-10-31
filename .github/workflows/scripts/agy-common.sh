#!/bin/bash
#
# Common helper functions and configurations for Antigravity CLI (agy) workflows.
# Conforms to Google Shell Style Guide.

set -euo pipefail

# Antigravity CLI default parameters
readonly AGY_DEFAULT_MODEL="gemini-3.8-flash-medium"
readonly AGY_DEFAULT_EFFORT="medium"
readonly AGY_DEFAULT_TIMEOUT="40m"

#######################################
# Prints an informational log message.
#######################################
log_info() {
  echo "[INFO] $(date +'%Y-%m-%d %H:%M:%S') $*"
}

#######################################
# Prints a warning log message.
#######################################
log_warn() {
  echo "[WARN] $(date +'%Y-%m-%d %H:%M:%S') $*" >&2
}

#######################################
# Prints an error log message.
#######################################
log_error() {
  echo "[ERROR] $(date +'%Y-%m-%d %H:%M:%S') $*" >&2
}

#######################################
# Configures Git user and sets up credentials via gh CLI.
# Clears any GitHub Actions token extraheader to ensure VM's gh credentials
# are used for git push.
#######################################
setup_git_and_gh() {
  log_info "Configuring Git and GitHub CLI authentication..."
  git config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true

  local gh_user gh_email
  gh_user=$(gh api user --jq .login)
  gh_email=$(gh api user --jq '.email // "\(.id)+\(.login)@users.noreply.github.com"')

  git config user.name "${gh_user}"
  git config user.email "${gh_email}"
  gh auth setup-git
  log_info "Git configured as ${gh_user} <${gh_email}> with gh credential helper."
}

#######################################
# Appends execution environment instructions to a prompt so agy focuses on
# file generation and validation while delegating git/PR operations to the wrapper.
# Arguments:
#   base_prompt: The original prompt string
#   target_path: The target file path expected to be created/updated
# Outputs:
#   Writes augmented prompt to stdout
#######################################
append_agy_env_notice() {
  local -r base_prompt="$1"
  local -r target_path="$2"

  cat <<EOF
${base_prompt}

---

## 【実行環境（Antigravity CLI 自動化ラッパー）に関する最優先ルール】
- Gitブランチの作成・コミット（\`git commit\`）・プッシュ（\`git push\`）・Pull Request作成（\`gh pr create\`）は、あなたの終了後に外側のシェルスクリプトが自動実行する。
- したがって、あなたは **\`${target_path}\` の作成・保存および指定された検証コマンドの実行のみ** を行い、Gitのコミット・プッシュ・PR作成コマンドは直接実行しないこと。
- \`${target_path}\` の保存と検証が完了した時点で、ユーザーへの確認や質問を一切行わず直ちに完了サマリーを出力して終了せよ。
EOF
}

#######################################
# Invokes Antigravity CLI (agy) in headless mode with standard configurations.
# Arguments:
#   prompt: The prompt text to pass to agy
#   output_log: Path to write raw JSON output (default: agy_output.json)
# Returns:
#   0 on success, non-zero on failure
#######################################
run_agy() {
  local -r prompt="$1"
  local -r output_log="${2:-agy_output.json}"

  export SSH_CONNECTION="dummy 1 2 3"
  log_info "Invoking Antigravity CLI (model: ${AGY_DEFAULT_MODEL}, effort: ${AGY_DEFAULT_EFFORT}, timeout: ${AGY_DEFAULT_TIMEOUT})..."

  agy -p "${prompt}" \
    --model "${AGY_DEFAULT_MODEL}" \
    --effort "${AGY_DEFAULT_EFFORT}" \
    --dangerously-skip-permissions \
    --print-timeout "${AGY_DEFAULT_TIMEOUT}" \
    --output-format json < /dev/null | tee "${output_log}"
}

#######################################
# Commits changes in target_path, pushes to remote, and creates a PR.
# Arguments:
#   branch_name: Head branch name
#   base_sha: Base commit SHA before agy execution
#   target_path: Allowed file path to stage and commit
#   commit_msg: Git commit message
#   pr_title: PR title
#   pr_body: PR body description
# Returns:
#   0 on success, 1 on failure / no changes
#######################################
commit_and_create_pr() {
  local -r branch_name="$1"
  local -r base_sha="$2"
  local -r target_path="$3"
  local -r commit_msg="$4"
  local -r pr_title="$5"
  local -r pr_body="$6"

  # If agy created local commits during execution, soft-reset to base_sha
  # so only the allowed target_path is staged and committed cleanly.
  if [[ "$(git rev-parse HEAD)" != "${base_sha}" ]]; then
    log_info "Resetting intermediate local commits to base SHA (${base_sha})..."
    git reset --soft "${base_sha}"
    git reset HEAD -- . >/dev/null 2>&1 || true
  fi

  if [[ ! -f "${target_path}" ]]; then
    log_warn "Target file ${target_path} does not exist."
    return 1
  fi

  # Check for changes in target_path
  if [[ -z "$(git status --porcelain "${target_path}" 2>/dev/null)" ]]; then
    log_warn "No changes detected in ${target_path} to commit."
    return 1
  fi

  # Validate JSON syntax if target is a JSON file
  if [[ "${target_path}" == *.json ]]; then
    if ! jq empty "${target_path}" 2>/dev/null; then
      log_error "Invalid JSON syntax detected in ${target_path}."
      return 1
    fi
  fi

  log_info "Staging ${target_path}..."
  git add "${target_path}"

  log_info "Committing: ${commit_msg}"
  git commit -m "${commit_msg}"

  log_info "Pushing branch ${branch_name} to origin..."
  git push origin "${branch_name}"

  log_info "Creating Pull Request: ${pr_title}"
  gh pr create \
    --base main \
    --head "${branch_name}" \
    --title "${pr_title}" \
    --body "${pr_body}"

  log_info "Pull Request created successfully."
  return 0
}

#######################################
# Restores working tree to base_sha and cleans up temporary files and branch.
# Preserves data/prompts and data/products for multi-item batch processing.
# Arguments:
#   base_sha: Base commit SHA to restore
#   branch_name: Temporary branch name to delete
#######################################
cleanup_branch_state() {
  local -r base_sha="$1"
  local -r branch_name="$2"

  git reset --hard "${base_sha}" >/dev/null 2>&1 || true
  git clean -fd -e data/prompts -e data/products >/dev/null 2>&1 || true
  git checkout -B main "${base_sha}" >/dev/null 2>&1 || true
  if [[ -n "${branch_name}" ]] && [[ "${branch_name}" != "main" ]]; then
    git branch -D "${branch_name}" >/dev/null 2>&1 || true
  fi
}

