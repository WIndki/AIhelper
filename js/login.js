document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });
        
        const data = await response.json();
        const messageEl = document.getElementById('loginMessage');
        
        if (response.ok) {
            messageEl.textContent = '登录成功！正在跳转...';
            messageEl.className = 'message success';
            messageEl.style.display = 'block';
            
            // 保存令牌到localStorage
            localStorage.setItem('userToken', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            
            // 跳转到首页或其他页面
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 1000);
        } else {
            messageEl.textContent = data.error || '登录失败';
            messageEl.className = 'message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        console.error('登录出错:', error);
        const messageEl = document.getElementById('loginMessage');
        messageEl.textContent = '登录时发生错误，请稍后再试';
        messageEl.className = 'message error';
        messageEl.style.display = 'block';
    }
});
