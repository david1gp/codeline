ALTER TABLE `session_history_entry` ADD `message_role` text;--> statement-breakpoint
UPDATE `session_history_entry`
SET `message_role` = CASE
  WHEN json_valid(`payload`) = 1 THEN CASE json_extract(`payload`, '$.role')
    WHEN 'assistant' THEN 'assistant'
    WHEN 'user' THEN 'user'
    ELSE NULL
  END
  ELSE NULL
END
WHERE `kind` = 'message';--> statement-breakpoint
CREATE INDEX `session_history_entry_session_kind_message_role_position_idx` ON `session_history_entry` (`session_id`,`kind`,`message_role`,`position`);
