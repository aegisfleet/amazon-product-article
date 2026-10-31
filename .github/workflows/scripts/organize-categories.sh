#!/bin/bash
#
# Category Organization Script using Antigravity CLI (agy).
#
# Reads the pre-generated prompt from data/prompts/organize-categories-prompt.txt,
# invokes agy to update data/categorygroups.json, normalizes category sorting and
# JSON formatting, and creates a pull request.

set -euo pipefail

# Load common library
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=.github/workflows/scripts/agy-common.sh
source "${SCRIPT_DIR}/agy-common.sh"

readonly PROMPT_FILE="data/prompts/organize-categories-prompt.txt"
readonly TARGET_FILE="data/categorygroups.json"

#######################################
# Sorts categories in data/categorygroups.json by Unicode code point order and
# formats with 2-space indentation + trailing newline to satisfy Biome checks.
#######################################
normalize_category_groups_json() {
  python3 -c '
import json

path = "data/categorygroups.json"
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

if isinstance(data, dict):
    for key, group in data.items():
        if isinstance(group, dict) and isinstance(group.get("categories"), list):
            group["categories"].sort()

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
'
}

#######################################
# Main execution function.
#######################################
main() {
  local -r today_jst="$(TZ='Asia/Tokyo' date +'%Y-%m-%d')"

  log_info "Starting category organization with Antigravity CLI for ${today_jst}."

  if [[ ! -f "${PROMPT_FILE}" ]]; then
    log_error "Category organization prompt file not found: ${PROMPT_FILE}"
    exit 1
  fi

  setup_git_and_gh

  local -r base_sha="$(git rev-parse HEAD)"
  local -r branch_name="organize-categories-${today_jst}-$(TZ='Asia/Tokyo' date +%H%M%S)"

  log_info "Creating and checking out branch: ${branch_name}"
  git checkout -b "${branch_name}" "${base_sha}"

  local base_prompt full_prompt
  base_prompt="$(cat "${PROMPT_FILE}")"
  full_prompt="$(append_agy_env_notice "${base_prompt}" "${TARGET_FILE}")"

  if ! run_agy "${full_prompt}"; then
    log_error "Antigravity CLI execution failed for category organization."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    exit 1
  fi

  if [[ -f "${TARGET_FILE}" ]]; then
    log_info "Normalizing category sort order and formatting in ${TARGET_FILE}..."
    normalize_category_groups_json
  fi

  local -r commit_msg="chore: organize categories (${today_jst})"
  local -r pr_title="Category Organization: ${today_jst}"
  local -r pr_body="Automated category organization by Antigravity CLI (agy) for ${today_jst}."

  if ! commit_and_create_pr "${branch_name}" "${base_sha}" "${TARGET_FILE}" "${commit_msg}" "${pr_title}" "${pr_body}"; then
    log_warn "No category changes were committed."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    exit 0
  fi

  cleanup_branch_state "${base_sha}" "${branch_name}"
  log_info "Category organization completed successfully."
}

main "$@"

