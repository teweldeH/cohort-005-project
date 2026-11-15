CREATE TABLE `seat_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seat_id` integer NOT NULL,
	`former_holder_user_id` integer NOT NULL,
	`released_at` text NOT NULL,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`former_holder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
