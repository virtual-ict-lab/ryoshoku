// SPDX-FileCopyrightText: 2026 mothue
// SPDX-License-Identifier: GPL-3.0-only

import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { PDF_URL, type Config } from "./config";
import { dateInJapan, addDays, weekdayDate } from "./dates";
import type { DailyMenu } from "./model";
import { MenuStore } from "./store";
import { updateMenu } from "./update";
import { createLogger, elapsed } from "./logger";

const log = createLogger("discord::commands");

const weekdays = [
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
  "日曜日",
];

const serviceFooter = {
  text: "香川高専 寮食検索サービス",
  iconURL:
    "https://pbs.twimg.com/profile_images/1931308501902692352/E5roil8I_400x400.jpg",
};

// TODO: コマンドの改善
export function commandDefinitions() {
  return [
    new SlashCommandBuilder()
      .setName("today")
      .setDescription("今日の献立を表示します"),
    new SlashCommandBuilder()
      .setName("tomorrow")
      .setDescription("明日の献立を表示します"),
    new SlashCommandBuilder()
      .setName("search")
      .setDescription("今週の献立を曜日で検索します")
      .addStringOption((o) =>
        o
          .setName("weekday")
          .setDescription("曜日")
          .setRequired(true)
          .addChoices(
            ...weekdays.map((name, i) => ({ name, value: String(i) })),
          ),
      ),
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Botの使い方を表示します"),
    new SlashCommandBuilder()
      .setName("privacy")
      .setDescription("保存する情報について表示します"),
    new SlashCommandBuilder()
      .setName("sr")
      .setDescription("管理者: 献立PDFを取得して更新します")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName("vj")
      .setDescription("管理者: 保存済み献立JSONを表示します")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

export function isAdminAllowed(
  guild: string | null,
  configuredGuild: string | undefined,
  administrator: boolean,
): boolean {
  return Boolean(configuredGuild && guild === configuredGuild && administrator);
}

export function makeEmbed(day: DailyMenu, label: string): EmbedBuilder {
  const clipped = (value: string) =>
    value.length <= 1024
      ? value
      : value.slice(0, 1000) + "\n…続きは原PDFを確認してください";
  const search = weekdays.includes(label) || label === "曜日検索";
  return new EmbedBuilder()
    .setTitle("日付")
    .setDescription(day.date)
    .setColor(search ? 0xd3381c : label === "明日" ? 0xaacf63 : 0x0d589c)
    .setAuthor({
      name: `${search ? "献立情報" : "寮食情報"}（${label}）`,
      url: PDF_URL,
    })
    .addFields(
      ...(["breakfast", "lunch", "dinner"] as const).map((key, i) => ({
        name: ["朝食", "昼食", "夕食"][i]!,
        value: clipped(
          day[key].text || "読み取り結果なし（未提供・認識失敗の可能性）",
        ),
        inline: false,
      })),
    )
    .setFooter(serviceFooter);
}

export function makeHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("寮食検索サービスの使い方")
    .setDescription("以下のコマンドを使用して，寮食情報を取得できます．")
    .setColor(0xf1c40f)
    .addFields(
      { name: "/today", value: "今日の献立を表示します．", inline: false },
      { name: "/tomorrow", value: "明日の献立を表示します．", inline: false },
      {
        name: "/search <曜日>",
        value: "今週の献立を曜日で検索します．曜日は選択肢から選んでください．",
        inline: false,
      },
    )
    .setFooter(serviceFooter);
}

export function makePrivacyEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("プライバシーポリシー")
    .setDescription(description)
    .setColor(0x2ecc71)
    .setFooter(serviceFooter);
}

export function responseFor(
  command: string,
  day: DailyMenu | null,
  date: string,
): { ephemeral: boolean; content?: string; embeds?: EmbedBuilder[] } {
  const ephemeral = command !== "today";
  if (!day)
    return { ephemeral, content: `${date} の献立はまだ取得できていません。` };
  const label =
    command === "today"
      ? "本日"
      : command === "tomorrow"
        ? "明日"
        : weekdays[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
  const notices =
    command === "today"
      ? ["今日の献立です．"]
      : command === "tomorrow"
        ? ["明日の献立です．"]
        : [];
  if (
    [day.breakfast, day.lunch, day.dinner].some((meal) => meal.warnings.length)
  )
    notices.push("OCRの認識が不確かな行があります");
  return {
    ephemeral,
    ...(notices.length ? { content: notices.join("\n") } : {}),
    embeds: [makeEmbed(day, label)],
  };
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  config: Config,
): Promise<void> {
  const name = interaction.commandName;
  const started = performance.now();
  let failed = false;
  log.info("Command received", { command: name });
  try {
    if (name === "help") {
      await interaction.reply({
        embeds: [makeHelpEmbed()],
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (name === "privacy") {
      await interaction.reply({
        embeds: [
          makePrivacyEmbed(
            "献立PDF・OCR結果・取得日時を稼働サーバーに保存します",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const admin = name === "sr" || name === "vj";
    if (
      admin &&
      !isAdminAllowed(
        interaction.guildId,
        config.adminGuildId,
        Boolean(
          interaction.memberPermissions?.has(PermissionFlagsBits.Administrator),
        ),
      )
    ) {
      log.warn("Admin command denied", { command: name });
      await interaction.reply({
        content: "この管理コマンドを使う権限がありません。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply(
      name === "today" ? {} : { flags: MessageFlags.Ephemeral },
    );
    const store = new MenuStore(config.dataDir);
    if (name === "sr") {
      const result = await updateMenu(config);
      await interaction.editReply({
        content: result.changed
          ? `献立を更新しました（${result.menu.startDate}〜${result.menu.endDate}）。`
          : "PDFの変更はありません。",
      });
      return;
    }
    if (name === "vj") {
      const bytes = Buffer.from(
        JSON.stringify(
          { schemaVersion: 1, weeks: await store.load() },
          null,
          2,
        ),
      );
      await interaction.editReply({
        files: [new AttachmentBuilder(bytes, { name: "menus.json" })],
      });
      return;
    }
    if (!["today", "tomorrow", "search"].includes(name)) {
      await interaction.editReply("未対応のコマンドです。");
      return;
    }
    const today = dateInJapan();
    const target =
      name === "tomorrow"
        ? addDays(today, 1)
        : name === "search"
          ? weekdayDate(
              today,
              Number(interaction.options.getString("weekday", true)),
            )
          : today;
    const { ephemeral: _, ...message } = responseFor(
      name,
      await store.find(target),
      target,
    );
    await interaction.editReply({ ...message, allowedMentions: { parse: [] } });
  } catch (error) {
    failed = true;
    log.error("Command failed", {
      command: name,
      duration: elapsed(started),
      error,
    });
    const message = {
      content:
        "献立の処理に失敗しました。保存済みの献立データは保持しています。",
      allowedMentions: { parse: [] as never[] },
    };
    if (interaction.deferred || interaction.replied)
      await interaction.editReply(message).catch(() => {});
    else
      await interaction
        .reply({ ...message, flags: MessageFlags.Ephemeral })
        .catch(() => {});
  } finally {
    if (!failed) {
      log.info("Command completed", {
        command: name,
        duration: elapsed(started),
      });
    }
  }
}
