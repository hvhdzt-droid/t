const {
  Client,
  GatewayIntentBits,
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

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("TOKEN غير موجود!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DIR = path.join(__dirname, "data");
const FILE = path.join(DIR, "tickets.json");

if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR, { recursive: true });
}

let db = {};

try {
  if (fs.existsSync(FILE)) {
    db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  }
} catch (error) {
  console.error("خطأ في قراءة البيانات:", error);
  db = {};
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function config(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      panelChannel: null,
      category: null,
      staffRole: null,
      types: ["دعم فني", "شكوى", "طلب إدارة", "استفسار"],
      tickets: {}
    };
  }

  const c = db[guildId];

  if (!c.types) c.types = [];
  if (!c.tickets) c.tickets = {};

  return c;
}

function color() {
  return Math.floor(Math.random() * 0xffffff);
}

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(color())
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "mine tickets" });
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function isAdmin(member) {
  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function isStaff(member, c) {
  return isAdmin(member) ||
    (c.staffRole && member.roles.cache.has(c.staffRole));
}

function setupPanel(c) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("setup_panel_channel")
    .setPlaceholder("اختر روم لوحة التكت")
    .setChannelTypes(ChannelType.GuildText);

  const role = new RoleSelectMenuBuilder()
    .setCustomId("setup_staff_role")
    .setPlaceholder("اختر رتبة إدارة التكت");

  const category = new ChannelSelectMenuBuilder()
    .setCustomId("setup_category")
    .setPlaceholder("اختر كاتيجوري التكت")
    .setChannelTypes(ChannelType.GuildCategory);

  const add = new ButtonBuilder()
    .setCustomId("setup_add_type")
    .setLabel("إضافة نوع")
    .setEmoji("➕")
    .setStyle(ButtonStyle.Success);

  const remove = new ButtonBuilder()
    .setCustomId("setup_remove_type")
    .setLabel("حذف نوع")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);

  const publish = new ButtonBuilder()
    .setCustomId("setup_publish")
    .setLabel("نشر لوحة التكت")
    .setEmoji("📨")
    .setStyle(ButtonStyle.Primary);

  const refresh = new ButtonBuilder()
    .setCustomId("setup_refresh")
    .setLabel("تحديث اللوحة")
    .setEmoji("🔄")
    .setStyle(ButtonStyle.Secondary);

  return [
    row(channel),
    row(role),
    row(category),
    row(add, remove),
    row(publish, refresh)
  ];
}

function setupEmbed(c) {
  return embed(
    "⚙️ Mine Tickets | لوحة الإعداد",
    [
      `**روم اللوحة:** ${c.panelChannel ? `<#${c.panelChannel}>` : "غير محدد"}`,
      `**رتبة الإدارة:** ${c.staffRole ? `<@&${c.staffRole}>` : "غير محددة"}`,
      `**كاتيجوري التكت:** ${c.category ? `<#${c.category}>` : "غير محدد"}`,
      "",
      "**أنواع التكت:**",
      c.types.map((t, i) => `${i + 1}. ${t}`).join("\n") || "لا توجد أنواع",
      "",
      "اختر الإعدادات من القوائم ثم اضغط نشر لوحة التكت."
    ].join("\n")
  );
}

function ticketPanel(c) {
  const options = c.types.slice(0, 25).map((type, i) => ({
    label: type.slice(0, 100),
    value: String(i),
    description: `فتح تكت: ${type}`.slice(0, 100),
    emoji: "🎫"
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_create")
    .setPlaceholder("اختر نوع التكت")
    .addOptions(options);

  return {
    embeds: [
      embed(
        "🎫 الدعم الفني | mine tickets",
        "مرحبًا بك!\n\nاختر نوع التكت المناسب من القائمة بالأسفل، وسيتم إنشاء روم خاص بك وبالإدارة.\n\nيرجى عدم فتح أكثر من تكت لنفس الطلب."
      )
    ],
    components: [row(menu)]
  };
}

function ticketControls() {
  return [
    row(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("استلام التكت")
        .setEmoji("🙋")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("إغلاق")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function closedControls() {
  return [
    row(
      new ButtonBuilder()
        .setCustomId("ticket_reopen")
        .setLabel("إعادة فتح")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ticket_delete")
        .setLabel("حذف التكت")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function createTicket(interaction, c, type) {
  const existing = Object.entries(c.tickets).find(
    ([channelId, t]) =>
      t.owner === interaction.user.id &&
      t.closed === false
  );

  if (existing) {
    const channel = interaction.guild.channels.cache.get(existing[0]);

    if (channel) {
      return interaction.reply({
        content: `لديك تكت مفتوح بالفعل: ${channel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    delete c.tickets[existing[0]];
  }

  const safeName = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 15) || "member";

  const permissions = [
    {
      id: interaction.guild.roles.everyone.id,
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
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels
      ]
    }
  ];

  if (c.staffRole) {
    permissions.push({
      id: c.staffRole,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: c.category || undefined,
    permissionOverwrites: permissions,
    topic: `Mine Ticket | Owner: ${interaction.user.id} | Type: ${type}`
  });

  c.tickets[channel.id] = {
    owner: interaction.user.id,
    type,
    closed: false,
    claimedBy: null,
    createdAt: Date.now()
  };

  save();

  const welcome = embed(
    "🎫 تم إنشاء تكت جديد",
    [
      `**صاحب التكت:** ${interaction.user}`,
      `**نوع التكت:** ${type}`,
      "",
      "اكتب مشكلتك بالتفصيل وسيتم الرد عليك من الإدارة.",
      "يرجى الانتظار حتى يتم استلام التكت."
    ].join("\n")
  );

  await channel.send({
    content: `${interaction.user} ${c.staffRole ? `<@&${c.staffRole}>` : ""}`,
    embeds: [welcome],
    components: ticketControls(),
    allowedMentions: {
      users: [interaction.user.id],
      roles: c.staffRole ? [c.staffRole] : []
    }
  });

  await interaction.reply({
    content: `✅ تم إنشاء تكتك: ${channel}`,
    flags: MessageFlags.Ephemeral
  });
}

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  if (message.content.trim().toLowerCase() !== "setup") return;

  if (!isAdmin(message.member)) {
    return message.reply("❌ هذا الأمر للمسؤولين فقط.");
  }

  const c = config(message.guild.id);

  await message.reply({
    embeds: [setupEmbed(c)],
    components: setupPanel(c)
  });
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.guild) return;

    const c = config(interaction.guild.id);
    const id = interaction.customId;

    // إعداد لوحة التكت

    if (id?.startsWith("setup_")) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "❌ هذه اللوحة للمسؤولين فقط.",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (id === "setup_panel_channel") {
      c.panelChannel = interaction.values[0];
      save();

      return interaction.update({
        embeds: [setupEmbed(c)],
        components: setupPanel(c)
      });
    }

    if (id === "setup_staff_role") {
      c.staffRole = interaction.values[0];
      save();

      return interaction.update({
        embeds: [setupEmbed(c)],
        components: setupPanel(c)
      });
    }

    if (id === "setup_category") {
      c.category = interaction.values[0];
      save();

      return interaction.update({
        embeds: [setupEmbed(c)],
        components: setupPanel(c)
      });
    }

    if (id === "setup_refresh") {
      return interaction.update({
        embeds: [setupEmbed(c)],
        components: setupPanel(c)
      });
    }

    if (id === "setup_add_type") {
      const modal = new ModalBuilder()
        .setCustomId("setup_type_modal")
        .setTitle("إضافة نوع تكت");

      const input = new TextInputBuilder()
        .setCustomId("type_name")
        .setLabel("اسم نوع التكت")
        .setPlaceholder("مثال: الدعم الفني")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);

      modal.addComponents(row(input));

      return interaction.showModal(modal);
    }

    if (id === "setup_type_modal") {
      const name = interaction.fields.getTextInputValue("type_name").trim();

      if (!name) {
        return interaction.reply({
          content: "اكتب اسمًا صحيحًا.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (c.types.length >= 25) {
        return interaction.reply({
          content: "وصلت للحد الأقصى وهو 25 نوعًا.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (c.types.some(t => t.toLowerCase() === name.toLowerCase())) {
        return interaction.reply({
          content: "هذا النوع موجود بالفعل.",
          flags: MessageFlags.Ephemeral
        });
      }

      c.types.push(name);
      save();

      return interaction.reply({
        embeds: [setupEmbed(c)],
        components: setupPanel(c),
        flags: MessageFlags.Ephemeral
      });
    }

    if (id === "setup_remove_type") {
      if (!c.types.length) {
        return interaction.reply({
          content: "لا توجد أنواع لحذفها.",
          flags: MessageFlags.Ephemeral
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("setup_remove_type_select")
        .setPlaceholder("اختر النوع الذي تريد حذفه")
        .addOptions(c.types.map((type, i) => ({
          label: type.slice(0, 100),
          value: String(i)
        })));

      return interaction.reply({
        content: "اختر النوع:",
        components: [row(menu)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (id === "setup_remove_type_select") {
      const index = Number(interaction.values[0]);

      if (!Number.isInteger(index) || !c.types[index]) {
        return interaction.reply({
          content: "هذا النوع غير موجود.",
          flags: MessageFlags.Ephemeral
        });
      }

      const removed = c.types.splice(index, 1)[0];
      save();

      return interaction.update({
        content: `✅ تم حذف نوع: ${removed}`,
        components: []
      });
    }

    if (id === "setup_publish") {
      if (!c.panelChannel) {
        return interaction.reply({
          content: "حدد روم لوحة التكت أولًا.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (!c.staffRole) {
        return interaction.reply({
          content: "حدد رتبة الإدارة أولًا.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (!c.types.length) {
        return interaction.reply({
          content: "أضف نوع تكت واحدًا على الأقل.",
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.guild.channels.cache.get(c.panelChannel);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({
          content: "روم اللوحة غير موجود.",
          flags: MessageFlags.Ephemeral
        });
      }

      await channel.send(ticketPanel(c));

      return interaction.reply({
        content: `✅ تم نشر لوحة التكت في ${channel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // إنشاء التكت

    if (id === "ticket_create") {
      const index = Number(interaction.values[0]);
      const type = c.types[index];

      if (!type) {
        return interaction.reply({
          content: "نوع التكت غير موجود.",
          flags: MessageFlags.Ephemeral
        });
      }

      return createTicket(interaction, c, type);
    }

    // أزرار التكت

    const ticket = c.tickets[interaction.channelId];

    if (id?.startsWith("ticket_") && !ticket) {
      return interaction.reply({
        content: "بيانات التكت غير موجودة.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (id === "ticket_claim") {
      if (!isStaff(interaction.member, c)) {
        return interaction.reply({
          content: "❌ هذا الزر للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (ticket.claimedBy) {
        return interaction.reply({
          content: `التكت مستلم بالفعل بواسطة <@${ticket.claimedBy}>`,
          flags: MessageFlags.Ephemeral
        });
      }

      ticket.claimedBy = interaction.user.id;
      save();

      return interaction.reply({
        embeds: [
          embed(
            "🙋 تم استلام التكت",
            `تم استلام التكت بواسطة ${interaction.user}`
          )
        ]
      });
    }

    if (id === "ticket_close") {
      if (
        interaction.user.id !== ticket.owner &&
        !isStaff(interaction.member, c)
      ) {
        return interaction.reply({
          content: "ليس لديك صلاحية إغلاق هذا التكت.",
          flags: MessageFlags.Ephemeral
        });
      }

      if (ticket.closed) {
        return interaction.reply({
          content: "التكت مغلق بالفعل.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        ticket.owner,
        { SendMessages: false }
      );

      ticket.closed = true;
      save();

      return interaction.reply({
        embeds: [
          embed(
            "🔒 تم إغلاق التكت",
            `تم إغلاق التكت بواسطة ${interaction.user}`
          )
        ],
        components: closedControls()
      });
    }

    if (id === "ticket_reopen") {
      if (!isStaff(interaction.member, c)) {
        return interaction.reply({
          content: "❌ إعادة فتح التكت للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        ticket.owner,
        { SendMessages: true }
      );

      ticket.closed = false;
      save();

      return interaction.reply({
        embeds: [
          embed(
            "🔓 تم فتح التكت",
            `تم إعادة فتح التكت بواسطة ${interaction.user}`
          )
        ],
        components: ticketControls()
      });
    }

    if (id === "ticket_delete") {
      if (!isStaff(interaction.member, c)) {
        return interaction.reply({
          content: "❌ حذف التكت للإدارة فقط.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.reply({
        content: "🗑️ سيتم حذف التكت خلال 5 ثوانٍ."
      });

      setTimeout(async () => {
        delete c.tickets[interaction.channelId];
        save();

        await interaction.channel.delete("Mine Tickets: Ticket deleted")
          .catch(console.error);
      }, 5000);
    }

  } catch (error) {
    console.error("Interaction Error:", error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ حدث خطأ. تأكد من صلاحيات البوت.",
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

client.once("ready", () => {
  console.log("================================");
  console.log(`✅ ${client.user.tag} is online`);
  console.log("🎫 Mine Tickets");
  console.log("================================");

  client.user.setPresence({
    activities: [{ name: "Mine Tickets 🎫" }],
    status: "online"
  });
});

client.login(TOKEN);
