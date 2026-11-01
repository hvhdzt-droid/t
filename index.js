const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ضع توكن البوت في متغير TOKEN في الاستضافة
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.log("❌ لم يتم العثور على TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// قاعدة البيانات
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
}

let database = {};

try {
  database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  database = {};
}

function saveDatabase() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2));
}

function getConfig(guildId) {
  if (!database[guildId]) {
    database[guildId] = {
      panelChannel: null,
      staffRole: null,
      category: null,
      image: null,
      types: ["الدعم الفني", "الشكوى", "الاستفسار"],
      tickets: {}
    };

    saveDatabase();
  }

  const config = database[guildId];

  if (!Array.isArray(config.types)) config.types = [];
  if (!config.tickets) config.tickets = {};
  if (!("image" in config)) config.image = null;

  return config;
}

function randomColor() {
  return Math.floor(Math.random() * 16777215);
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(randomColor())
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionsBitField.Flags.Administrator
  ) ?? false;
}

function isStaff(interaction, config) {
  if (isAdmin(interaction)) return true;

  if (!config.staffRole) return false;

  const roles = interaction.member?.roles;

  if (roles?.cache) {
    return roles.cache.has(config.staffRole);
  }

  if (Array.isArray(roles)) {
    return roles.includes(config.staffRole);
  }

  return false;
}

function setupEmbed(config) {
  const types = config.types.length
    ? config.types.map((type, i) => `**${i + 1}.** ${type}`).join("\n")
    : "لا توجد أنواع تذاكر.";

  const embed = makeEmbed(
    "إعدادات Mine Tickets",
    [
      `**روم اللوحة:** ${config.panelChannel ? `<#${config.panelChannel}>` : "غير محدد"}`,
      `**رتبة الإدارة:** ${config.staffRole ? `<@&${config.staffRole}>` : "غير محددة"}`,
      `**كاتيجوري التذاكر:** ${config.category ? `<#${config.category}>` : "غير محدد"}`,
      `**صورة اللوحة:** ${config.image ? "تم تعيين صورة ✅" : "لا توجد صورة"}`,
      "",
      "**أنواع التذاكر:**",
      types,
      "",
      "استخدم الأزرار والقوائم لتعديل الإعدادات."
    ].join("\n")
  );

  if (config.image) {
    embed.setImage(config.image);
  }

  return embed;
}

function setupComponents(config) {
  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_panel_channel")
      .setPlaceholder("اختر روم لوحة التذاكر")
      .setChannelTypes(ChannelType.GuildText)
  );

  const roleRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId("setup_staff_role")
      .setPlaceholder("اختر رتبة الإدارة")
  );

  const categoryRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_category")
      .setPlaceholder("اختر كاتيجوري التذاكر")
      .setChannelTypes(ChannelType.GuildCategory)
  );

  const typesRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_add_type")
      .setLabel("إضافة نوع")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("setup_remove_type")
      .setLabel("حذف نوع")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("setup_set_image")
      .setLabel("تعيين صورة")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("setup_remove_image")
      .setLabel("حذف الصورة")
      .setStyle(ButtonStyle.Secondary)
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_preview")
      .setLabel("معاينة اللوحة")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("setup_publish")
      .setLabel("نشر اللوحة")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("setup_refresh")
      .setLabel("تحديث الإعدادات")
      .setStyle(ButtonStyle.Primary)
  );

  return [
    channelRow,
    roleRow,
    categoryRow,
    typesRow,
    actionRow
  ];
}

function ticketPanel(config) {
  const embed = makeEmbed(
    "🎫 نظام التذاكر",
    "اختر نوع التذكرة من القائمة بالأسفل وسيتم فتح تذكرة خاصة بك.\n\nيرجى كتابة تفاصيل طلبك بوضوح وانتظار فريق الإدارة."
  );

  if (config.image) {
    embed.setImage(config.image);
  }

  const options = config.types.slice(0, 25).map((type, index) => ({
    label: type.slice(0, 100),
    value: String(index),
    description: `فتح تذكرة: ${type}`.slice(0, 100)
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_create")
    .setPlaceholder("اختر نوع التذكرة")
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

function ticketButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("استلام")
        .setEmoji("🙋")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("إغلاق")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("ticket_reopen")
        .setLabel("إعادة فتح")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ticket_delete")
        .setLabel("حذف")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function showSetup(interaction) {
  const config = getConfig(interaction.guildId);

  await interaction.reply({
    embeds: [setupEmbed(config)],
    components: setupComponents(config),
    flags: MessageFlags.Ephemeral
  });
}

// أمر setup بدون /
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.trim().toLowerCase() !== "setup") return;

  if (!message.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  )) {
    return message.reply("❌ هذا الأمر للإدارة فقط.");
  }

  const config = getConfig(message.guild.id);

  await message.reply({
    embeds: [setupEmbed(config)],
    components: setupComponents(config)
  });
});

// التفاعلات
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.guild) return;

    const config = getConfig(interaction.guildId);
    const id = interaction.customId;

    // إعدادات البوت
    if (id?.startsWith("setup_")) {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ هذه الإعدادات للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      // اختيار روم اللوحة
      if (id === "setup_panel_channel") {
        config.panelChannel = interaction.values[0];
        saveDatabase();

        return interaction.update({
          embeds: [setupEmbed(config)],
          components: setupComponents(config)
        });
      }

      // اختيار رتبة الإدارة
      if (id === "setup_staff_role") {
        config.staffRole = interaction.values[0];
        saveDatabase();

        return interaction.update({
          embeds: [setupEmbed(config)],
          components: setupComponents(config)
        });
      }

      // اختيار الكاتيجوري
      if (id === "setup_category") {
        config.category = interaction.values[0];
        saveDatabase();

        return interaction.update({
          embeds: [setupEmbed(config)],
          components: setupComponents(config)
        });
      }

      // إضافة نوع تذكرة
      if (id === "setup_add_type") {
        const modal = new ModalBuilder()
          .setCustomId("setup_type_modal")
          .setTitle("إضافة نوع تذكرة");

        const input = new TextInputBuilder()
          .setCustomId("type_name")
          .setLabel("اسم نوع التذكرة")
          .setPlaceholder("مثال: الدعم الفني")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // حذف نوع تذكرة
      if (id === "setup_remove_type") {
        if (!config.types.length) {
          return interaction.reply({
            content: "لا توجد أنواع لحذفها.",
            flags: MessageFlags.Ephemeral
          });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId("setup_remove_type_select")
          .setPlaceholder("اختر النوع الذي تريد حذفه")
          .addOptions(
            config.types.slice(0, 25).map((type, index) => ({
              label: type.slice(0, 100),
              value: String(index)
            }))
          );

        return interaction.reply({
          content: "اختر نوع التذكرة الذي تريد حذفه:",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      // فتح نافذة تعيين الصورة
      if (id === "setup_set_image") {
        const modal = new ModalBuilder()
          .setCustomId("setup_image_modal")
          .setTitle("تعيين صورة لوحة التذاكر");

        const input = new TextInputBuilder()
          .setCustomId("image_url")
          .setLabel("رابط الصورة")
          .setPlaceholder("https://example.com/image.png")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // حذف الصورة
      if (id === "setup_remove_image") {
        config.image = null;
        saveDatabase();

        return interaction.update({
          embeds: [setupEmbed(config)],
          components: setupComponents(config)
        });
      }

      // معاينة اللوحة
      if (id === "setup_preview") {
        if (!config.types.length) {
          return interaction.reply({
            content: "أضف نوع تذكرة واحدًا على الأقل أولًا.",
            flags: MessageFlags.Ephemeral
          });
        }

        return interaction.reply({
          ...ticketPanel(config),
          flags: MessageFlags.Ephemeral
        });
      }

      // نشر اللوحة
      if (id === "setup_publish") {
        if (!config.panelChannel || !config.staffRole) {
          return interaction.reply({
            content: "❌ حدد روم اللوحة ورتبة الإدارة أولًا.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (!config.types.length) {
          return interaction.reply({
            content: "❌ أضف نوع تذكرة واحدًا على الأقل.",
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = await interaction.guild.channels.fetch(
          config.panelChannel
        ).catch(() => null);

        if (!channel || channel.type !== ChannelType.GuildText) {
          return interaction.reply({
            content: "❌ روم اللوحة غير موجود أو غير صالح.",
            flags: MessageFlags.Ephemeral
          });
        }

        await channel.send(ticketPanel(config));

        return interaction.reply({
          content: `✅ تم نشر لوحة التذاكر في ${channel}.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // تحديث الإعدادات
      if (id === "setup_refresh") {
        return interaction.update({
          embeds: [setupEmbed(config)],
          components: setupComponents(config)
        });
      }

      // اختيار نوع للحذف
      if (id === "setup_remove_type_select") {
        const index = Number(interaction.values[0]);

        if (!Number.isInteger(index) || !config.types[index]) {
          return interaction.reply({
            content: "❌ النوع غير موجود.",
            flags: MessageFlags.Ephemeral
          });
        }

        const removed = config.types.splice(index, 1)[0];
        saveDatabase();

        return interaction.update({
          content: `✅ تم حذف نوع التذكرة: ${removed}`,
          embeds: [],
          components: []
        });
      }
    }

    // حفظ نوع التذكرة من النافذة
    if (id === "setup_type_modal") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      const name = interaction.fields.getTextInputValue("type_name").trim();

      if (!name) {
        return interaction.reply({
          content: "❌ اكتب اسم النوع.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (config.types.length >= 25) {
        return interaction.reply({
          content: "❌ الحد الأقصى لأنواع التذاكر هو 25.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (config.types.some(type => type.toLowerCase() === name.toLowerCase())) {
        return interaction.reply({
          content: "❌ هذا النوع موجود مسبقًا.",
          flags: MessageFlags.Ephemeral
        });
      }

      config.types.push(name);
      saveDatabase();

      return interaction.reply({
        content: `✅ تمت إضافة النوع: ${name}`,
        embeds: [setupEmbed(config)],
        components: setupComponents(config),
        flags: MessageFlags.Ephemeral
      });
    }

    // حفظ رابط الصورة
    if (id === "setup_image_modal") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      const imageUrl = interaction.fields
        .getTextInputValue("image_url")
        .trim();

      let parsedUrl;

      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        return interaction.reply({
          content: "❌ الرابط غير صالح. تأكد من كتابة رابط صحيح.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (!["https:", "http:"].includes(parsedUrl.protocol)) {
        return interaction.reply({
          content: "❌ يجب أن يبدأ الرابط بـ https:// أو http://",
          flags: MessageFlags.Ephemeral
        });
      }

      config.image = parsedUrl.toString();
      saveDatabase();

      return interaction.reply({
        content: "✅ تم حفظ الصورة. يمكنك معاينة اللوحة أو نشرها.",
        embeds: [setupEmbed(config)],
        components: setupComponents(config),
        flags: MessageFlags.Ephemeral
      });
    }

    // إنشاء تذكرة
    if (id === "ticket_create") {
      const index = Number(interaction.values[0]);
      const type = config.types[index];

      if (!type) {
        return interaction.reply({
          content: "❌ نوع التذكرة غير موجود.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (!config.staffRole) {
        return interaction.reply({
          content: "❌ لم يتم إعداد رتبة الإدارة.",
          flags: MessageFlags.Ephemeral
        });
      }

      const existing = Object.entries(config.tickets).find(
        ([channelId, ticket]) =>
          ticket.ownerId === interaction.user.id &&
          ticket.status !== "deleted" &&
          interaction.guild.channels.cache.has(channelId)
      );

      if (existing) {
        return interaction.reply({
          content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existing[0]}>`,
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const safeName = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 15) || "user";

      const channelOptions = {
        name: `ticket-${safeName}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.EmbedLinks
            ]
          },
          {
            id: config.staffRole,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.EmbedLinks
            ]
          }
        ]
      };

      if (config.category &&
          interaction.guild.channels.cache.has(config.category)) {
        channelOptions.parent = config.category;
      }

      const ticketChannel = await interaction.guild.channels.create(
        channelOptions
      );

      config.tickets[ticketChannel.id] = {
        ownerId: interaction.user.id,
        type,
        claimedBy: null,
        status: "open"
      };

      saveDatabase();

      const ticketEmbed = makeEmbed(
        "🎫 تذكرتك جاهزة",
        [
          `**صاحب التذكرة:** ${interaction.user}`,
          `**نوع التذكرة:** ${type}`,
          "",
          "اكتب تفاصيل طلبك هنا، وسيقوم فريق الإدارة بمساعدتك."
        ].join("\n")
      );

      await ticketChannel.send({
        content: `${interaction.user} | <@&${config.staffRole}>`,
        embeds: [ticketEmbed],
        components: ticketButtons()
      });

      return interaction.editReply({
        content: `✅ تم فتح تذكرتك: ${ticketChannel}`
      });
    }

    // أزرار التذاكر
    if ([
      "ticket_claim",
      "ticket_close",
      "ticket_reopen",
      "ticket_delete"
    ].includes(id)) {
      const ticket = config.tickets[interaction.channelId];

      if (!ticket) {
        return interaction.reply({
          content: "❌ هذه القناة ليست تذكرة مسجلة.",
          flags: MessageFlags.Ephemeral
        });
      }

      const staff = isStaff(interaction, config);
      const owner = ticket.ownerId === interaction.user.id;

      // استلام التذكرة
      if (id === "ticket_claim") {
        if (!staff) {
          return interaction.reply({
            content: "❌ هذا الزر لفريق الإدارة فقط.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (ticket.claimedBy) {
          return interaction.reply({
            content: `❌ التذكرة مستلمة بالفعل بواسطة <@${ticket.claimedBy}>`,
            flags: MessageFlags.Ephemeral
          });
        }

        ticket.claimedBy = interaction.user.id;
        saveDatabase();

        return interaction.reply({
          embeds: [
            makeEmbed(
              "🙋 تم استلام التذكرة",
              `استلم التذكرة: ${interaction.user}`
            )
          ]
        });
      }

      // إغلاق التذكرة
      if (id === "ticket_close") {
        if (!staff && !owner) {
          return interaction.reply({
            content: "❌ لا تملك صلاحية إغلاق هذه التذكرة.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (ticket.status === "closed") {
          return interaction.reply({
            content: "التذكرة مغلقة بالفعل.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.channel.permissionOverwrites.edit(
          ticket.ownerId,
          { SendMessages: false }
        );

        ticket.status = "closed";
        saveDatabase();

        return interaction.reply({
          embeds: [
            makeEmbed(
              "🔒 تم إغلاق التذكرة",
              `تم إغلاق التذكرة بواسطة ${interaction.user}`
            )
          ]
        });
      }

      // إعادة فتح التذكرة
      if (id === "ticket_reopen") {
        if (!staff) {
          return interaction.reply({
            content: "❌ إعادة فتح التذكرة للإدارة فقط.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.channel.permissionOverwrites.edit(
          ticket.ownerId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }
        );

        ticket.status = "open";
        saveDatabase();

        return interaction.reply({
          embeds: [
            makeEmbed(
              "🔓 تم فتح التذكرة",
              `أعاد فتح التذكرة: ${interaction.user}`
            )
          ]
        });
      }

      // حذف التذكرة
      if (id === "ticket_delete") {
        if (!staff) {
          return interaction.reply({
            content: "❌ حذف التذكرة للإدارة فقط.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply({
          content: "🗑️ سيتم حذف التذكرة بعد 3 ثوانٍ.",
          flags: MessageFlags.Ephemeral
        });

        ticket.status = "deleted";
        saveDatabase();

        setTimeout(() => {
          interaction.channel.delete("تم حذف التذكرة").catch(() => {});
        }, 3000);
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const message = "❌ حدث خطأ أثناء تنفيذ العملية. راجع سجل الاستضافة.";

    if (interaction.deferred) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({
        content: message,
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

client.once("ready", () => {
  console.log(`✅ ${client.user.tag} is online`);
});

client.login(TOKEN);
