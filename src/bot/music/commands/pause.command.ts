import { InteractionFromServer } from '$/bot/common/guards/interaction-from-server.guard';
import { MessageService } from '$/bot/common/message.service';
import { Command, DiscordCommand, UseGuards } from '@discord-nestjs/core';
import { Logger } from '@nestjs/common';
import { CommandInteraction, GuildMember } from 'discord.js';
import { MusicGuard } from '../guards/music.guard';
import { MusicService } from '../services/music.service';

@Command({
	name: 'pause',
	description: 'Pauses the current song',
})
@UseGuards(InteractionFromServer, MusicGuard)
export class PauseCommand implements DiscordCommand {
	private readonly logger = new Logger(PauseCommand.name);

	constructor(private readonly messageService: MessageService, private readonly musicService: MusicService) {}

	async handler(interaction: CommandInteraction) {
		const member = interaction.member;

		if (!(member instanceof GuildMember)) {
			return;
		}

		const voiceChannel = member.voice?.channel;

		if (!voiceChannel) {
			throw `You need to be in a voice channel to pause music!`;
		}

		const reply = this.musicService.pause(interaction);

		await this.messageService.send(interaction, reply);
	}
}
