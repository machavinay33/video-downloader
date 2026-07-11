CREATE TABLE `downloadHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`platform` varchar(64) NOT NULL,
	`title` text,
	`filename` varchar(512) NOT NULL,
	`downloadType` enum('video','audio') NOT NULL DEFAULT 'video',
	`quality` varchar(64),
	`audioFormat` varchar(32),
	`fileSize` int,
	`duration` int,
	`thumbnail` varchar(2048),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `downloadHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `downloadHistory` ADD CONSTRAINT `downloadHistory_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;