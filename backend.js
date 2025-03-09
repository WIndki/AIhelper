const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { OpenAI } = require("openai");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");

// 添加日志记录函数
function logAction(username, action) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "/");
  const timeStr = now.toTimeString().slice(0, 8);
  console.log(
    `${dateStr} ${timeStr} user:${username || "unknown"} action:${action}`
  );
}

// 数据库初始化
const dbPath = path.join(__dirname, "users.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("数据库连接失败:", err.message);
  } else {
    console.log("已连接到SQLite数据库");
    // 创建用户表
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
      (err) => {
        if (err) {
          console.error("创建用户表失败:", err.message);
        } else {
          console.log("确保用户表已创建");
        }
      }
    );
  }
});

// 存储生成的令牌和过期时间以及关联的用户ID
let validTokens = new Map();
// 用于存储用户ID到用户名的映射
let userIdToName = new Map();

// 生成临时令牌
function generateTOKEN(userId, username) {
  const token = crypto.randomBytes(32).toString("hex");
  // 设置令牌有效期为5分钟
  const expiresAt = Date.now() + 5 * 60 * 1000;
  validTokens.set(token, { expiresAt, userId });
  // 保存用户ID到用户名的映射
  userIdToName.set(userId, username);

  // 清理过期的令牌
  for (const [key, data] of validTokens.entries()) {
    if (data.expiresAt < Date.now()) {
      validTokens.delete(key);
    }
  }

  return token;
}

// 验证令牌是否有效
function isValidToken(token) {
  if (!validTokens.has(token)) return false;

  const { expiresAt } = validTokens.get(token);
  if (expiresAt < Date.now()) {
    validTokens.delete(token);
    return false;
  }

  return true;
}

// 获取令牌关联的用户ID
function getUserIdFromToken(token) {
  if (!isValidToken(token)) return null;
  return validTokens.get(token).userId;
}

// 根据用户ID获取用户名
function getUsernameFromId(userId) {
  return userIdToName.get(userId) || "unknown";
}

async function init() {
  try {
    const app = express();

    // 添加静态文件服务，用于访问测试页面
    const configPath = path.join(__dirname, "config.json");
    const config = await JSON.parse(fs.readFileSync(configPath, "utf8"));
    app.listen(config.port, () => {
      console.log(`Server is running on ${config.hostname}:${config.port}`);
      console.log(
        `访问测试页面: http://${config.hostname}:${config.port}/index.html`
      );
    });
    return { app, config };
  } catch (error) {
    console.error(error);
  }
}

(async () => {
  const { app, config } = await init();
  if (app) {
    app.use(express.static(path.join(__dirname)));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get("/", (req, res) => {
      logAction("visitor", "accessing homepage");
      res.send(
        `Hello World, from Express`
      );
    });

    // 用户注册API
    app.post("/register", async (req, res) => {
      try {
        const { username, password } = req.body;
        logAction(username, "attempting registration");

        // 验证输入
        if (!username || !password) {
          logAction(username, "registration failed: missing credentials");
          return res.status(400).json({ error: "用户名和密码都是必需的" });
        }

        // 检查用户名是否已存在
        db.get(
          "SELECT id FROM users WHERE username = ?",
          [username],
          async (err, user) => {
            if (err) {
              logAction(username, `registration error: ${err.message}`);
              console.error(err);
              return res.status(500).json({ error: "服务器错误" });
            }

            if (user) {
              logAction(
                username,
                "registration failed: username already exists"
              );
              return res.status(409).json({ error: "用户名已存在" });
            }

            // 加盐哈希密码
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // 保存用户到数据库
            db.run(
              "INSERT INTO users (username, password) VALUES (?, ?)",
              [username, hashedPassword],
              function (err) {
                if (err) {
                  logAction(username, `registration error: ${err.message}`);
                  console.error(err);
                  return res.status(500).json({ error: "注册失败" });
                }

                logAction(
                  username,
                  `registration successful with ID: ${this.lastID}`
                );
                res
                  .status(201)
                  .json({ message: "用户注册成功", userId: this.lastID });
              }
            );
          }
        );
      } catch (error) {
        logAction(
          req.body?.username || "unknown",
          `registration error: ${error.message}`
        );
        console.error(error);
        res.status(500).json({ error: "服务器错误" });
      }
    });

    // 用户登录API
    app.post("/login", (req, res) => {
      try {
        const { username, password } = req.body;
        logAction(username, "attempting login");

        // 验证输入
        if (!username || !password) {
          logAction(username, "login failed: missing credentials");
          return res.status(400).json({ error: "用户名和密码都是必需的" });
        }

        // 在数据库中查找用户
        db.get(
          "SELECT * FROM users WHERE username = ?",
          [username],
          async (err, user) => {
            if (err) {
              logAction(username, `login error: ${err.message}`);
              console.error(err);
              return res.status(500).json({ error: "服务器错误" });
            }

            if (!user) {
              logAction(username, "login failed: user not found");
              return res.status(401).json({ error: "用户名或密码错误" });
            }

            // 验证密码
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
              logAction(username, "login failed: incorrect password");
              return res.status(401).json({ error: "用户名或密码错误" });
            }

            // 生成带有用户ID的令牌
            const token = generateTOKEN(user.id, username);
            logAction(username, "login successful");
            res.json({ token, userId: user.id, username: user.username });
          }
        );
      } catch (error) {
        logAction(
          req.body?.username || "unknown",
          `login error: ${error.message}`
        );
        console.error(error);
        res.status(500).json({ error: "服务器错误" });
      }
    });

    // 添加/getToken路径，现在需要先登录才能获取令牌
    app.get("/getToken", (req, res) => {
      logAction("visitor", "unauthorized token request");
      res.status(401).json({ error: "需要先登录获取令牌" });
    });

    // 添加/api路径，验证令牌后返回内容
    app.get("/api", (req, res) => {
      const token = req.query.token;
      if (token && isValidToken(token)) {
        const userId = getUserIdFromToken(token);
        const username = getUsernameFromId(userId);
        const getModels = req.query.getModels;
        if (getModels) {
          logAction(username, "requested model list");
          res.json({ models: config.available_models, userId });
        }
      } else {
        logAction("unknown", "api access with invalid token");
        res.status(401).json({ error: "无效的令牌" });
      }
    });

    // 添加/openai路径，验证令牌后调用OpenAI API
    app.get("/openai-stream", async (req, res) => {
      const token = req.query.token;
      const selected_model = req.query.model;
      const prompt = req.query.prompt;

      if (!token || !isValidToken(token)) {
        logAction("unknown", "invalid token for openai-stream request");
        return res.status(401).json({ error: "令牌错误" });
      }

      if (!prompt) {
        const userId = getUserIdFromToken(token);
        const username = getUsernameFromId(userId);
        logAction(username, "openai-stream request missing prompt");
        return res.status(400).json({ error: "缺少提示词" });
      }

      try {
        const userId = getUserIdFromToken(token);
        const username = getUsernameFromId(userId);
        logAction(
          username,
          `openai-stream request with model: ${selected_model}`
        );

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        let isAnswering = false;

        const openai = new OpenAI({
          apiKey: config.OPEN_AI_API_KEY,
          baseURL: config.OPEN_AI_API_URL,
        });

        // 解析传入的聊天历史
        let messages = [];
        try {
          // 尝试解析JSON格式的聊天历史
          messages = JSON.parse(prompt);
        } catch (e) {
          // 如果不是JSON格式，则按照单条消息处理
          messages = [{ role: "user", content: prompt }];
        }

        const stream = await openai.chat.completions.create({
          model: selected_model,
          messages: messages,
          stream: true,
        });
        res.write("data: <think>\n\n");
        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.reasoning_content) {
            // 对思考内容进行编码，确保换行符被转义为\n
            const content = chunk.choices[0].delta.reasoning_content
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r");
            res.write(`data: ${content}\n\n`);
          } else if (chunk.choices[0]?.delta?.content) {
            if (!isAnswering) {
              isAnswering = true;
              res.write("data: </think>\n\n");
            }
            // 确保内容中的换行符被转义为\n
            const content = chunk.choices[0].delta.content
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r");
            res.write(`data: ${content}\n\n`);
          }
        }

        res.write("data: [DONE]\n\n");
        logAction(username, "openai-stream request completed");
        res.end();
      } catch (error) {
        const userId = getUserIdFromToken(token);
        const username = getUsernameFromId(userId);
        logAction(username, `openai-stream error: ${error.message}`);
        console.error("Error calling OpenAI API:", error);
        res.status(500).json({ error: "调用OpenAI API时出错" });
      }
    });
  }
})();
