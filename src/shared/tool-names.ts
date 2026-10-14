/**
 * Tool names, shared with the browser (which needs to know where to execute a Live tool call).
 * Must match TOOL_SPECS in src/agent/tools.ts – checked by a unit test.
 */
export const SERVER_TOOL_NAMES = [
	"get_my_profile",
	"find_services",
	"get_service_info",
	"check_eligibility",
	"get_appointment_slots",
	"create_handoff",
	"remember",
	"forget",
] as const;

export const CLIENT_TOOL_NAMES = [
	"open_form",
	"fill_fields",
	"focus_field",
	"get_form_state",
	"translate_form",
	"show_original",
	"set_ui_preferences",
	"request_submission",
	"request_appointment_booking",
	"close_form",
] as const;

export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

export function isServerTool(name: string): boolean {
	return (SERVER_TOOL_NAMES as readonly string[]).includes(name);
}
