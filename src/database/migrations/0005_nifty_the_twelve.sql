CREATE TABLE `skill_selection_default` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_path` text NOT NULL,
	`preset_name` text DEFAULT 'default' NOT NULL,
	`selection_override` text DEFAULT '{"disabledSkills":[],"enabledSkills":[]}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_selection_default_user_project_idx` ON `skill_selection_default` (`user_id`,`project_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_selection_default_user_project_unique` ON `skill_selection_default` (`user_id`,`project_path`);--> statement-breakpoint
ALTER TABLE `session` ADD `skill_selection` text DEFAULT '{"activeSkills":[],"excludedSkillNames":[],"missingFolderPaths":[],"missingSkillNames":[],"presetName":"default","userOverride":{"disabledSkills":[],"enabledSkills":[]},"version":1}' NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `execution_manifest` text;