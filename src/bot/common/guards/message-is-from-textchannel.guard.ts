import { PrismaService } from '$/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { DiscordGuard } from 'discord-nestjs';
import { ClientEvents, Message, TextChannel } from 'discord.js';

@Injectable()
export class MessageIsFromTextChannelGuard implements DiscordGuard {
	constructor(private readonly prisma: PrismaService) {}

	async canActive(event: keyof ClientEvents, [message]: [Message]): Promise<boolean> {
		if (event != 'message') {
			return true;
		}

		const isMessageFromTextChannel = message.channel instanceof TextChannel;

		if (!isMessageFromTextChannel) {
			await message.channel.send(`Sorry, I can only do this command in a server!`);
		}

		return isMessageFromTextChannel;
	}
}