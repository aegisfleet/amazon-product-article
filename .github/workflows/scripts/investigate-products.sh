#!/bin/bash
#
# Product Investigation Script using Antigravity CLI (agy).
#
# Reads pre-generated prompts from data/prompts/manifest.json, runs agy for each
# product sequentially, commits data/investigations/<ASIN>.json to a dedicated
# branch, and creates a pull request.
# Also records successfully processed ASINs to data/prompts/completed-asins.txt.

set -euo pipefail

# Load common library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
# shellcheck source=.github/workflows/scripts/agy-common.sh
source "${SCRIPT_DIR}/agy-common.sh"

readonly PROMPTS_DIR="data/prompts"
readonly MANIFEST_FILE="${PROMPTS_DIR}/manifest.json"
readonly COMPLETED_ASINS_FILE="${PROMPTS_DIR}/completed-asins.txt"

#######################################
# Processes a single product investigation using its pre-generated prompt.
# Arguments:
#   asin: Product ASIN
#   title: Product title
#   prompt_file: Path to prompt text file
#   base_sha: Base commit SHA of main branch
#   today_jst: Current date in JST
# Returns:
#   0 on success, 1 on failure
#######################################
process_single_product() {
  local -r asin="$1"
  local -r title="$2"
  local -r prompt_file="$3"
  local -r base_sha="$4"
  local -r today_jst="$5"

  if [[ ! -f "${prompt_file}" ]]; then
    log_error "Prompt file not found for ${asin}: ${prompt_file}"
    return 1
  fi

  local -r target_path="data/investigations/${asin}.json"
  local branch_name
  branch_name="investigate-${asin}-$(TZ='Asia/Tokyo' date +%Y%m%d-%H%M%S)"
  readonly branch_name

  log_info "=== Investigating Product: ${asin} (${title}) ==="
  git checkout -b "${branch_name}" "${base_sha}"

  local base_prompt full_prompt
  base_prompt="$(cat "${prompt_file}")"
  full_prompt="$(append_agy_env_notice "${base_prompt}" "${target_path}")"

  if ! run_agy "${full_prompt}"; then
    log_error "Antigravity CLI execution failed for ${asin}."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    return 1
  fi

  local -r commit_msg="feat: investigate product ${asin}"
  local -r pr_title="Product Investigation: ${asin} (${title:0:60})"
  local -r pr_body="Automated product investigation by Antigravity CLI (agy) for ASIN \`${asin}\` (${today_jst})."

  if ! commit_and_create_pr "${branch_name}" "${base_sha}" "${target_path}" "${commit_msg}" "${pr_title}" "${pr_body}"; then
    log_error "Failed to commit or create pull request for ${asin}."
    cleanup_branch_state "${base_sha}" "${branch_name}"
    return 1
  fi

  cleanup_branch_state "${base_sha}" "${branch_name}"
  echo "${asin}" >> "${COMPLETED_ASINS_FILE}"
  log_info "Successfully completed investigation and PR creation for ${asin}."
  return 0
}

#######################################
# Main execution function.
#######################################
main() {
  local today_jst
  today_jst="$(TZ='Asia/Tokyo' date +'%Y-%m-%d')"
  readonly today_jst

  log_info "Starting product investigation batch with Antigravity CLI."

  mkdir -p "${PROMPTS_DIR}"
  : > "${COMPLETED_ASINS_FILE}"

  if [[ ! -f "${MANIFEST_FILE}" ]]; then
    log_error "Manifest file not found: ${MANIFEST_FILE}"
    exit 1
  fi

  local total_items
  total_items="$(jq -r '.items | length' "${MANIFEST_FILE}")"

  if [[ "${total_items}" -eq 0 ]]; then
    log_info "No products in manifest to investigate. Exiting."
    exit 0
  fi

  setup_git_and_gh

  local base_sha
  base_sha="$(git rev-parse HEAD)"
  readonly base_sha
  log_info "Base commit SHA: ${base_sha}"
  log_info "Products to investigate: ${total_items}"

  local success_count=0
  local fail_count=0
  local idx=0

  while [[ "${idx}" -lt "${total_items}" ]]; do
    local asin title prompt_file
    asin="$(jq -r ".items[${idx}].asin" "${MANIFEST_FILE}")"
    title="$(jq -r ".items[${idx}].title" "${MANIFEST_FILE}")"
    prompt_file="$(jq -r ".items[${idx}].promptFile" "${MANIFEST_FILE}")"

    if process_single_product "${asin}" "${title}" "${prompt_file}" "${base_sha}" "${today_jst}"; then
      success_count=$((success_count + 1))
    else
      fail_count=$((fail_count + 1))
    fi

    idx=$((idx + 1))
  done

  log_info "=== Investigation Summary ==="
  log_info "Total: ${total_items}, Succeeded: ${success_count}, Failed: ${fail_count}"

  if [[ "${success_count}" -eq 0 ]] && [[ "${total_items}" -gt 0 ]]; then
    log_error "All product investigations failed."
    exit 1
  fi

  log_info "Product investigation batch completed."
}

main "$@"

