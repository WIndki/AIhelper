document.addEventListener("DOMContentLoaded", function () {
  const token = localStorage.getItem("userToken");
  const username = localStorage.getItem("username");
  let chatHistory = [];
  let isProcessing = false;
  let lastUserMessage = ""; // 存储上一次用户输入，用于重试功能

  // 配置marked选项，全面支持Markdown特性
  marked.setOptions({
    gfm: true, // GitHub风格的Markdown
    breaks: true, // 支持GitHub风格的换行
    pedantic: false,
    sanitize: false, // 不进行HTML输入过滤
    smartLists: true,
    smartypants: true, // 使用更智能的标点符号
    xhtml: false,
    highlight: function (code, language) {
      // 检测语言是否有效
      const validLanguage = language && hljs.getLanguage(language);
      if (validLanguage) {
        try {
          return hljs.highlight(code, { language }).value;
        } catch (error) {
          console.error("无法高亮代码:", error);
        }
      }
      // 如果语言无效或发生错误，尝试自动检测
      try {
        return hljs.highlightAuto(code).value;
      } catch (error) {
        console.error("无法自动高亮代码:", error);
      }
      return code; // 最后返回未高亮的代码
    },
  });

  // 扩展marked渲染器以支持更多功能
  const renderer = new marked.Renderer();

  // 优化代码块渲染，添加复制按钮
  // renderer.code = function (code, language, isEscaped) {
  //     const langClass = language ? ` class="language-${language}"` : '';
  //     const dataLang = language ? ` data-language="${language}"` : '';
  //     const escapedCode = isEscaped ? code : escape(code);

  //     return `<pre${dataLang}><button class="code-copy-btn" onclick="copyCode(this)">复制</button><code${langClass}>${escapedCode}</code></pre>`;
  // };

  // 让表格支持响应式
  renderer.table = function (header, body) {
    return (
      '<div class="table-responsive"><table>' +
      "<thead>" +
      header +
      "</thead>" +
      "<tbody>" +
      body +
      "</tbody>" +
      "</table></div>"
    );
  };

  marked.use({ renderer });

  // 初始化聊天历史
  chatHistory.push({
    role: "assistant",
    content: "您好，我是AI助手，有什么可以帮助您的吗？",
  });

  // 为初始消息添加复制事件监听
  addCopyEventListener();

  // 检查用户是否已登录
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  // 显示欢迎信息
  document.getElementById("welcomeMessage").textContent = `欢迎, ${
    username || "用户"
  }`;

  // 退出登录
  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem("userToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    window.location.href = "/login.html";
  });

  // 获取可用模型列表
  fetch(`/api?token=${token}&getModels=true`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("令牌无效，请重新登录");
      }
      return response.json();
    })
    .then((data) => {
      const modelSelector = document.getElementById("modelSelector");
      data.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelSelector.appendChild(option);
      });
    })
    .catch((error) => {
      console.error("获取模型列表失败:", error);
      localStorage.removeItem("userToken");
      window.location.href = "/login.html";
    });

  // 使文本框可以自动调整高度
  const promptTextarea = document.getElementById("prompt");
  promptTextarea.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  // Enter键发送消息，Shift+Enter换行
  promptTextarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("generateBtn").click();
    }
  });

  // 清空对话
  document.getElementById("clearBtn").addEventListener("click", function () {
    if (confirm("确定要清空当前对话吗？")) {
      chatHistory = [
        {
          role: "assistant",
          content: "您好，我是AI助手，有什么可以帮助您的吗？",
        },
      ];
      const messagesDiv = document.getElementById("messages");
      messagesDiv.innerHTML =
        '<div class="message assistant-message">您好，我是AI助手，有什么可以帮助您的吗？<div class="message-actions"><button class="action-btn copy-btn" title="复制">📋</button></div></div>';
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      // 重新添加复制按钮事件
      addCopyEventListener();
    }
  });

  // 为复制按钮添加事件监听
  function addCopyEventListener() {
    const copyBtns = document.querySelectorAll(".copy-btn");
    copyBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        const messageElement = this.closest(".message");
        // 排除按钮自身文本内容
        let messageText;
        if (messageElement.classList.contains("assistant-message")) {
          // 为AI助手消息，尝试从历史中获取原始内容
          const index = Array.from(
            document.querySelectorAll(".assistant-message")
          ).indexOf(messageElement);

          // 查找对应的历史消息
          let assistantMessages = chatHistory.filter(
            (msg) => msg.role === "assistant"
          );
          if (index < assistantMessages.length) {
            messageText = assistantMessages[index].content;
          } else {
            // 如果找不到原始文本，则清理HTML
            const tempElement = messageElement.cloneNode(true);
            tempElement
              .querySelectorAll(".message-actions, .code-copy-btn")
              .forEach((el) => el.remove());
            messageText = tempElement.textContent.trim();
          }
        } else {
          // 对于用户消息，获取纯文本
          messageText = messageElement.textContent.replace(/📋|🔄/g, "").trim();
        }

        navigator.clipboard
          .writeText(messageText)
          .then(() => {
            // 显示复制成功的临时提示
            const originalText = this.innerHTML;
            this.innerHTML = "✓";
            setTimeout(() => {
              this.innerHTML = originalText;
            }, 1000);
          })
          .catch((err) => console.error("复制失败:", err));
      });
    });
  }

  // 全局复制代码函数，确保原始代码被复制
  window.copyCode = function (button) {
    const codeElement = button.nextElementSibling;
    // 获取原始代码文本，不含HTML标签
    const code = codeElement.textContent;

    navigator.clipboard
      .writeText(code)
      .then(() => {
        const originalText = button.textContent;
        button.textContent = "✓";
        setTimeout(() => {
          button.textContent = originalText;
        }, 1000);
      })
      .catch((err) => console.error("复制代码失败:", err));
  };

  // 创建重试按钮并添加事件监听
  function addRetryButton(messageElement) {
    const actionsDiv = messageElement.querySelector(".message-actions");
    const retryBtn = document.createElement("button");
    retryBtn.className = "action-btn retry-btn";
    retryBtn.title = "重试";
    retryBtn.innerHTML = "🔄";
    retryBtn.addEventListener("click", function () {
      // 获取最后一条用户消息
      if (lastUserMessage) {
        // 先删除AI的回复（最后一条）
        if (
          chatHistory.length > 0 &&
          chatHistory[chatHistory.length - 1].role === "assistant"
        ) {
          chatHistory.pop();
        }

        // 重新发送请求
        const prompt = lastUserMessage;
        const model = document.getElementById("modelSelector").value;
        sendMessage(prompt, model);
      }
    });
    actionsDiv.appendChild(retryBtn);
  }
  document.getElementById("generateBtn").addEventListener("click", function () {
    if (isProcessing) return;

    const prompt = document.getElementById("prompt").value.trim();
    const model = document.getElementById("modelSelector").value;

    if (!prompt) {
      alert("请输入消息");
      return;
    }

    lastUserMessage = prompt;
    sendMessage(prompt, model);
  });

  // 转义HTML特殊字符的函数
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 转义特殊字符但保留Markdown语法的函数
  function escapeForMarkdown(text) {
    // 首先用临时标记替换反斜杠转义，以保护它们
    let preservedText = text
      // 保护代码块
      .replace(/```([\s\S]*?)```/g, function (match) {
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      })
      // 保护行内代码
      .replace(/`([^`]+)`/g, function (match) {
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      });

    // 执行常规转义，但忽略已保护的部分
    return preservedText;
  }

  // 处理接收到的数据，统一解码和处理转义字符
  function processReceivedData(data) {
    try {
      // 先尝试URL解码
      const decodedData = decodeURIComponent(data);

      // 尝试JSON解析以处理转义字符
      try {
        return JSON.parse('"' + decodedData + '"');
      } catch (e) {
        // JSON解析失败，手动处理转义字符
        return decodedData
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, "\\");
      }
    } catch (decodeError) {
      // URL解码失败，先尝试手动处理转义字符
      const processedData = data
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");

      // 再手动处理常见URL编码字符
      return processedData
        .replace(/%23/g, "#")
        .replace(/%25/g, "%")
        .replace(/%26/g, "&")
        .replace(/%2B/g, "+")
        .replace(/%2F/g, "/")
        .replace(/%3A/g, ":")
        .replace(/%3F/g, "?")
        .replace(/%40/g, "@")
        .replace(/%20/g, " ")
        .replace(/%22/g, '"')
        .replace(/%27/g, "'")
        .replace(/%3C/g, "<")
        .replace(/%3E/g, ">")
        .replace(/%5C/g, "\\")
        .replace(/%5B/g, "[")
        .replace(/%5D/g, "]")
        .replace(/%7B/g, "{")
        .replace(/%7D/g, "}");
    }
  }

  // 渲染Markdown内容
  function renderMarkdown(container, content) {
    try {
      // container.innerHTML = marked.parse(escapeForMarkdown(content));
      container.innerHTML = marked.parse(content);
      // 应用代码高亮
      container.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
        const language = block.className.match(/language-(\w+)/)?.[1] || "code";

        // 获取原始代码
        const originalCode = block.textContent;

        // 创建外部包装器
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";

        // 创建语言标签
        const languageLabel = document.createElement("span");
        languageLabel.className = "code-language";
        languageLabel.textContent = language;

        // 创建复制按钮
        const copyButtonDiv = document.createElement("div");
        copyButtonDiv.className = "message-actions";
        const copyButton = document.createElement("button");
        copyButton.className = "code-copy-btn";
        copyButton.textContent = "📋";
        copyButton.onclick = function () {
          navigator.clipboard.writeText(originalCode).then(() => {
            copyButton.textContent = "✓";
            setTimeout(() => {
              copyButton.textContent = "📋";
            }, 1000);
          });
        };
        copyButtonDiv.appendChild(copyButton);

        // 获取pre元素并添加语言类名
        const preElement = block.parentElement;
        preElement.classList.add(`language-${language}`);

        // 重新组织DOM结构
        preElement.parentNode.insertBefore(wrapper, preElement);
        wrapper.appendChild(languageLabel);
        wrapper.appendChild(copyButtonDiv);
        wrapper.appendChild(preElement);
      });
      return true;
    } catch (error) {
      console.error("Markdown渲染错误:", error);
      container.textContent = content;
      return false;
    }
  }

  // 处理发送消息的函数，支持重试功能
  function sendMessage(prompt, model) {
    const messagesDiv = document.getElementById("messages");

    // 禁用输入和按钮
    document.getElementById("generateBtn").disabled = true;
    document.getElementById("prompt").disabled = true;
    isProcessing = true;

    // 显示用户消息
    const userMessageDiv = document.createElement("div");
    userMessageDiv.className = "message user-message";
    userMessageDiv.innerHTML = `${prompt}<div class="message-actions"><button class="action-btn copy-btn" title="复制">📋</button></div>`;
    messagesDiv.appendChild(userMessageDiv);

    // 清空输入框并滚动到底部
    document.getElementById("prompt").value = "";
    document.getElementById("prompt").style.height = "auto";
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // 添加用户消息到历史
    chatHistory.push({
      role: "user",
      content: prompt,
    });

    // 添加复制事件监听
    addCopyEventListener();

    // 准备完整的上下文对话
    const chatContext = JSON.stringify(chatHistory);

    // 创建SSE连接
    const eventSource = new EventSource(
      `/openai-stream?token=${token}&model=${model}&prompt=${encodeURIComponent(
        chatContext
      )}`
    );
    let isThinking = false;
    let thinkingContent = "";

    // 创建AI回复消息容器
    const aiMessageDiv = document.createElement("div");
    aiMessageDiv.className = "message assistant-message";

    // 创建思考内容的折叠面板
    const thinkingPanel = document.createElement("div");
    thinkingPanel.className = "thinking-panel";
    
    // 创建折叠面板的标题栏
    const thinkingHeader = document.createElement("div");
    thinkingHeader.className = "thinking-header";
    thinkingHeader.innerHTML = '<span>思考过程</span><button class="toggle-thinking">显示</button>';
    
    // 创建思考内容容器
    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "thinking-content";
    thinkingDiv.style.display = "none"; // 默认折叠
    
    // 组装思考面板
    thinkingPanel.appendChild(thinkingHeader);
    thinkingPanel.appendChild(thinkingDiv);
    
    // 添加折叠/展开功能
    thinkingHeader.querySelector('.toggle-thinking').addEventListener('click', function() {
      if (thinkingDiv.style.display === "none") {
        thinkingDiv.style.display = "block";
        this.textContent = "隐藏";
      } else {
        thinkingDiv.style.display = "none";
        this.textContent = "显示";
      }
      // 滚动到底部以确保可见
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    // 创建消息操作按钮容器
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "message-actions";
    const copyBtn = document.createElement("button");
    copyBtn.className = "action-btn copy-btn";
    copyBtn.title = "复制";
    copyBtn.innerHTML = "📋";
    actionsDiv.appendChild(copyBtn);

    let currentContent = "";

    eventSource.onmessage = function (event) {
      if (event.data === "<think>") {
        isThinking = true;
        thinkingContent = "";
        // 创建AI回复容器并添加思考面板
        messagesDiv.appendChild(aiMessageDiv);
        aiMessageDiv.appendChild(thinkingPanel);
      } else if (event.data === "</think>") {
        isThinking = false;
        // 不需要移除思考内容div，已经内嵌在AI回复容器中
      } else if (event.data === "[DONE]") {
        // 最终渲染完整内容
        renderMarkdown(aiMessageDiv, currentContent);
        if(thinkingContent) {
          aiMessageDiv.insertBefore(thinkingPanel, aiMessageDiv.firstChild);
        }
        // 添加操作按钮
        aiMessageDiv.appendChild(actionsDiv);

        // 添加重试按钮到用户消息
        addRetryButton(userMessageDiv);

        // 为新添加的复制按钮添加事件
        addCopyEventListener();

        // 添加助手消息到历史
        chatHistory.push({
          role: "assistant",
          content: currentContent,
        });

        eventSource.close();
        document.getElementById("generateBtn").disabled = false;
        document.getElementById("prompt").disabled = false;
        isProcessing = false;
      } else {
        // 处理接收到的数据
        const processedData = processReceivedData(event.data);

        if (isThinking) {
          thinkingContent += escapeHtml(processedData);
          thinkingDiv.textContent = thinkingContent;
          // 思考过程更新时显示更新标记
          const headerSpan = thinkingHeader.querySelector('span');
          if (!headerSpan.textContent.includes('(更新)')) {
            headerSpan.textContent = '思考过程 (更新)';
          }
        } else {
          // 添加到当前内容
          currentContent += processedData;

          // 实时渲染Markdown
          renderMarkdown(aiMessageDiv, currentContent);
        }
      }

      // 始终保持滚动到最新消息
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    eventSource.onerror = function () {
      const errorDiv = document.createElement("div");
      errorDiv.className = "message assistant-message";
      errorDiv.innerHTML =
        '<span style="color: red;">错误: 请求中断，请重试</span>';
      messagesDiv.appendChild(errorDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      eventSource.close();
      document.getElementById("generateBtn").disabled = false;
      document.getElementById("prompt").disabled = false;
      isProcessing = false;
    };
  }
});
