import { probability } from '$common/utils/funcs';
import { On } from '@discord-nestjs/core';
import { Controller, Logger } from '@nestjs/common';
import { VoiceState } from 'discord.js';
import { FRANCOIS_USER_ID, NICO_USER_ID, JF_USER_ID } from '../constants/moms.ids';
import { JoinType, MomsMusicService } from './moms-music.service';

@Controller()
export class MomsMusicGateway {
	private readonly logger = new Logger(MomsMusicGateway.name);

	constructor(private readonly momsMusicService: MomsMusicService) { }

	@On('voiceStateUpdate')
	async onFrancoisJoin(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
		const state = this.momsMusicService.getMemberState({
			userId: FRANCOIS_USER_ID,
			oldVoiceState,
			newVoiceState,
		});

		if (!state) {
			return;
		}

		const { member: francoisMember, voiceState } = state;

		const numberOfDays = 7;

		const francoisTimeout = 60 * 24 * numberOfDays;

		// "Victory" theme song
		const query = 'https://www.youtube.com/watch?v=E94f_b92wl4';

		await this.momsMusicService.playThemeIfAwayFor({
			voiceChannel: voiceState.channel,
			user: francoisMember.user,
			query,
			timeout: francoisTimeout,
			doCreateLog: (lastLogInTimeout) => {
				return !lastLogInTimeout || francoisMember == voiceState.member;
			},
		});
	}

	@On('voiceStateUpdate')
	async onNicoJoin(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
		const state = this.momsMusicService.getMemberState({
			userId: NICO_USER_ID,
			oldVoiceState,
			newVoiceState,
			joinType: JoinType.ONLY_USER,
		});

		if (!state) {
			return;
		}

		const { member: nicoMember, voiceState } = state;

		const numberOfMinutes = 30;

		// "Annoying" theme song
		const query = 'https://youtu.be/DvR6-SQzqO8';

		await this.momsMusicService.playThemeIfAwayFor({
			voiceChannel: voiceState.channel,
			user: nicoMember.user,
			query,
			timeout: numberOfMinutes,
			doCreateLog: (lastLogInTimeout) => {
				return !lastLogInTimeout || nicoMember == voiceState.member;
			},
			doPlayMusic: () => {
				const percentage = 33;

				return probability(percentage);
			},
		});
	}

	@On('voiceStateUpdate')
	async onJfJoin(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
		const state = this.momsMusicService.getMemberState({
			userId: JF_USER_ID,
			oldVoiceState,
			newVoiceState,
			joinType: JoinType.ONLY_USER,
		});

		if (!state) {
			return;
		}

		const { member: jfMember, voiceState } = state;

		const numberOfMinutes = 50;

		const allQuerys = [
			'https://youtu.be/NPbWhDaESds?si=sa1L5YiJd-yiLww7',
			'https://youtu.be/j5BXUF_4PP0?si=ubkyzLoXaSVGmAWy',
			'https://youtu.be/opBFaCS_PV4?si=jtn_UY2v39G7D1wO',
			'https://youtu.be/kpwNjdEPz7E?si=lFJfVm2V_BcbpAmO',
			'https://youtu.be/PaOP88t298E?si=bLpFzI6v74e735ls',
			'https://youtu.be/f8mL0_4GeV0?si=SnuvLD8wbUtQqepp',
			'https://youtu.be/x7qiftEnQOc?si=AY1bnSKNQW8KdUAK',
			'https://youtu.be/iBAEt06J2Ho?si=sVjT0f0Dm2YjZM-j',
			'https://youtu.be/b3FJgIZVW4g?si=Xmxl8wCMebLGFoPQ',
			'https://youtu.be/8CcP8hbZpew?si=EE71Dg-gDHPUQGLn',
			'https://youtu.be/IkhrZcgHAwU?si=lNyANOGd4J8S2awm',
			'https://youtu.be/mdUlSd2Md0M?si=hRd3Ev9nEubOhLVc',
			'https://youtu.be/3yVd52L748U?si=xQaLsIYed4E2SCUP',
			'https://youtu.be/GbaHFNu_bAM?si=FW9Xj86B7DoicdYY',
			'https://youtu.be/JqwMdzrqZn8?si=BwnJ2LQ2lXVuwDKV',
			'https://youtu.be/TSkJw8KvwbM?si=i3lxwD9Ym9G7N_kX'
		];

		const query = allQuerys[this.randomIntFromInterval(0, (allQuerys.length - 1))];

		await this.momsMusicService.playThemeIfAwayFor({
			voiceChannel: voiceState.channel,
			user: jfMember.user,
			query,
			timeout: numberOfMinutes,
			doCreateLog: (lastLogInTimeout) => {
				return !lastLogInTimeout || jfMember == voiceState.member;
			},
			doPlayMusic: () => {
				const percentage = 35;

				return probability(percentage);
			},
		});
	}

	private randomIntFromInterval(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1) + min)
	}
}
