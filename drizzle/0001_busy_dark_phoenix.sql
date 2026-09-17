CREATE TABLE `help` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`media_key` text,
	`media_mime` text,
	`media_size` integer,
	`status` text DEFAULT 'baru' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `help_author` ON `help` (`author_id`);--> statement-breakpoint
CREATE INDEX `help_status` ON `help` (`status`);--> statement-breakpoint
CREATE INDEX `help_created_at` ON `help` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`retention_days` integer DEFAULT 365 NOT NULL,
	`privacy_contact` text DEFAULT '' NOT NULL,
	`privacy_notice` text DEFAULT 'HAFECS Research and Publication menggunakan data peserta untuk mengevaluasi dan memperbaiki kualitas pelatihan. Identitas peserta hanya dapat diakses oleh petugas yang berwenang.' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_workspace`("id", "name", "owner_id", "retention_days", "privacy_contact", "privacy_notice", "created_at") SELECT "id", "name", "owner_id", "retention_days", "privacy_contact", "privacy_notice", "created_at" FROM `workspace`;--> statement-breakpoint
DROP TABLE `workspace`;--> statement-breakpoint
ALTER TABLE `__new_workspace` RENAME TO `workspace`;--> statement-breakpoint
PRAGMA foreign_keys=ON;