document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    const messageEl = document.getElementById('registerMessage');
    
    if (password !== confirmPassword) {
        messageEl.textContent = '两次输入的密码不一致';
        messageEl.className = 'message error';
        messageEl.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            messageEl.textContent = '注册成功！请登录';
            messageEl.className = 'message success';
            messageEl.style.display = 'block';
            
            // 清空表单
            document.getElementById('registerForm').reset();
            
            // 显示跳转到登录页面链接
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            messageEl.textContent = data.error || '注册失败';
            messageEl.className = 'message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        console.error('注册出错:', error);
        messageEl.textContent = '注册时发生错误，请稍后再试';
        messageEl.className = 'message error';
        messageEl.style.display = 'block';
    }
});
