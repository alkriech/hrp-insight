CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_at` ON `audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`training_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`questions_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`share_hash` text NOT NULL,
	`share_cipher` text NOT NULL,
	`expires_at` text,
	`pair_question_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`locked_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_share_hash_unique` ON `forms` (`share_hash`);--> statement-breakpoint
CREATE INDEX `forms_training_id` ON `forms` (`training_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_form_id` ON `media` (`form_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`totp_cipher` text,
	`totp_last_counter` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_username_unique` ON `members` (`username`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`participant_key` text NOT NULL,
	`pairing_basis` text NOT NULL,
	`answers_cipher` text NOT NULL,
	`score` real,
	`max_score` real,
	`request_id` text NOT NULL,
	`receipt` text NOT NULL,
	`consent_at` text NOT NULL,
	`privacy_snapshot` text NOT NULL,
	`expires_at` text NOT NULL,
	`excluded` integer DEFAULT 0 NOT NULL,
	`exclusion_reason` text,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_form_participant_unique` ON `responses` (`form_id`,`participant_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `responses_request_unique` ON `responses` (`form_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `responses_expiry` ON `responses` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`reauth_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_member` ON `sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`questions_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_members` (
	`training_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_members_unique` ON `training_members` (`training_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `training_members_member` ON `training_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`program` text NOT NULL,
	`status` text DEFAULT 'Rencana' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`facilitator` text DEFAULT '' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trainings_created_by` ON `trainings` (`created_by`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`retention_days` integer DEFAULT 365 NOT NULL,
	`privacy_contact` text DEFAULT '' NOT NULL,
	`privacy_notice` text DEFAULT 'Data digunakan oleh HRP Insight untuk evaluasi dan peningkatan kualitas pelatihan. Identitas hanya dapat diakses oleh petugas yang berwenang.' NOT NULL,
	`created_at` text NOT NULL
);
