#!/bin/bash
#
# Today's Recommendations Investigation Script using Antigravity CLI (agy).
#
# Reads the pre-generated prompt from data/prompts/recommendations-prompt.txt,
# invokes agy to generate data/recommendations/today.json, and creates a PR.

set -euo pipefail

# Load common library
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/workflows/scripts/agy-common.sh
source "${SCRIPT_DIR}/agy-common.sh"

readonly PROMPT_FILE="data/prompts/recommendations-prompt.txt"
readonly TARGET_FILE="data/recommendations/today.json"

#######################################
# Main execution function.
#######################################
main() {
  local -r today_jst="$(TZ='Asia/Tokyo' date +'%Y-%m-%d')"

  log_info "Starting today's recommendations investigation for ${today_jst}."

  if [[ ! -f "${PROMPT_FILE}" ]]; then
    log_error "Recommendation prompt file not found: ${PROMPT_FILE}"
    exit 1
  fi

  setup_git_and_gh

  local -r base_sha="$(git rev-parse HEAD)"
  local -r branch_name="recommendations-${today_jst}-$(TZ='Asia/Tokyo' date +%H%M%S)"

  log_info "Creating and checking out branch: ${branch_name}"
  git checkout -b "${branch_name}" "${base_sha}"

  local base_prompt full_prompt
  base_prompt="$(cat "${PROMPT_FILE}")"
  full_prompt="$(append_agy_env_notice "${base_prompt}" "${TARGET_FILE}")"

  if ! run_agy "${full_prompt}"; then
    log_error "Antigravity CLI execution failed for recommendations."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    exit 1
  fi

  local -r commit_msg="feat: update today's recommended products (${today_jst})"
  local -r pr_title="Today's Recommended Products Investigation (${today_jst})"
  local -r pr_body="Automated today's recommendations investigation by Antigravity CLI (agy) for ${today_jst}."

  if ! commit_and_create_pr "${branch_name}" "${base_sha}" "${TARGET_FILE}" "${commit_msg}" "${pr_title}" "${pr_body}"; then
    log_error "Failed to commit or create pull request for today's recommendations."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    exit 1
  fi

  cleanup_branch_state "${base_sha}" "${branch_name}"
  log_info "Today's recommendations investigation completed successfully."
}

main "$@"

