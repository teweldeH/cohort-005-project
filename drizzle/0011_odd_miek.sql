ALTER TABLE `refunds` RENAME TO `refund_requests`;--> statement-breakpoint
ALTER TABLE `coupons` RENAME TO `seats`;--> statement-breakpoint
ALTER TABLE `seats` RENAME COLUMN "redeemed_by_user_id" TO "claimed_by_user_id";--> statement-breakpoint
ALTER TABLE `seats` RENAME COLUMN "redeemed_at" TO "claimed_at";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_refund_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`reason` text NOT NULL,
	`amount_refunded` integer,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by_user_id` integer,
	`decision_note` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_refund_requests`("id", "purchase_id", "status", "reason", "amount_refunded", "requested_at", "resolved_at", "resolved_by_user_id", "decision_note") SELECT "id", "purchase_id", "status", "reason", "amount_refunded", "requested_at", "resolved_at", "resolved_by_user_id", "decision_note" FROM `refund_requests`;--> statement-breakpoint
DROP TABLE `refund_requests`;--> statement-breakpoint
ALTER TABLE `__new_refund_requests` RENAME TO `refund_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `refund_requests_purchase_idx` ON `refund_requests` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `__new_seats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`code` text NOT NULL,
	`purchase_id` integer NOT NULL,
	`claimed_by_user_id` integer,
	`claimed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_seats`("id", "team_id", "course_id", "code", "purchase_id", "claimed_by_user_id", "claimed_at", "created_at") SELECT "id", "team_id", "course_id", "code", "purchase_id", "claimed_by_user_id", "claimed_at", "created_at" FROM `seats`;--> statement-breakpoint
DROP TABLE `seats`;--> statement-breakpoint
ALTER TABLE `__new_seats` RENAME TO `seats`;--> statement-breakpoint
CREATE UNIQUE INDEX `seats_code_unique` ON `seats` (`code`);--> statement-breakpoint
ALTER TABLE `team_members` DROP COLUMN `role`;