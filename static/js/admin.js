let currentConfig = {};

// 页面加载时获取当前配置
window.onload = function() {
    loadConfig();
};

function loadConfig() {
    fetch('/admin/config')
    .then(response => response.json())
    .then(data => {
        currentConfig = data;
        
        // 填充表单
        Object.keys(data).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                element.value = data[key];
            }
        });
        
        // 更新LOGO预览
        updateLogoPreview();
    })
    .catch(error => {
        showMessage('加载配置失败: ' + error.message, 'error');
    });
}

function updateLogoPreview() {
    const logoUrl = document.getElementById('logo_url').value;
    const preview = document.getElementById('logo-preview');
    if (logoUrl) {
        preview.src = logoUrl;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// LOGO上传
document.getElementById('logo-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('logo', file);
        
        fetch('/admin/upload-logo', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('logo_url').value = data.logo_url;
                updateLogoPreview();
                showMessage('LOGO上传成功！', 'success');
            } else {
                showMessage('LOGO上传失败: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showMessage('LOGO上传失败: ' + error.message, 'error');
        });
    }
});

// 监听LOGO URL变化
document.getElementById('logo_url').addEventListener('input', updateLogoPreview);

function saveSettings() {
    const settings = {};
    const fields = [
        'site_title', 'site_subtitle', 'logo_url', 'header_text', 'footer_text',
        'max_upload_size', 'allowed_extensions', 'upload_folder',
        'max_downloads', 'max_expire_hours', 'admin_password'
    ];
    
    fields.forEach(field => {
        const element = document.getElementById(field);
        if (element) {
            settings[field] = element.value;
        }
    });
    
    // 如果密码为空，使用原密码
    if (!settings.admin_password) {
        settings.admin_password = currentConfig.admin_password;
    }
    
    fetch('/admin/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('设置保存成功！', 'success');
            loadConfig(); // 重新加载配置
        } else {
            showMessage('设置保存失败: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('设置保存失败: ' + error.message, 'error');
    });
}

function showMessage(text, type) {
    const messageElement = document.getElementById(type + '-message');
    messageElement.textContent = text;
    messageElement.style.display = 'block';
    
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 5000);
}

// 页面加载时获取统计信息
window.onload = function() {
loadConfig();
loadStats();
};

function loadStats() {
fetch('/admin/stats')
.then(response => response.json())
.then(data => {
document.getElementById('total-files').textContent = data.total_files;
document.getElementById('active-files').textContent = data.active_files;
document.getElementById('expired-files').textContent = data.expired_files;
document.getElementById('limit-reached-files').textContent = data.limit_reached_files;
document.getElementById('total-size').textContent = data.total_size;
document.getElementById('upload-folder').textContent = data.upload_folder;
})
.catch(error => {
console.error('获取统计信息失败:', error);
});
}

function cleanupSystem() {
if (!confirm('确定要清理系统缓存吗？这将删除孤立的文件和临时数据。')) {
return;
}

fetch('/admin/cleanup', {
method: 'POST'
})
.then(response => response.json())
.then(data => {
if (data.success) {
    showMessage(`系统清理完成！清理了 ${data.cleanup_count} 个文件。`, 'success');
    loadStats(); // 重新加载统计信息
} else {
    showMessage('系统清理失败: ' + data.error, 'error');
}
})
.catch(error => {
showMessage('系统清理失败: ' + error.message, 'error');
});
}

function resetSystem() {
const password = document.getElementById('reset-confirm-password').value;

if (!password) {
showMessage('请输入管理员密码', 'error');
return;
}

if (!confirm('⚠️ 警告：此操作将删除所有文件和记录，恢复到初始状态！\n\n确定要继续吗？')) {
return;
}

if (!confirm('⚠️ 最后确认：此操作不可撤销！\n\n真的要重置系统吗？')) {
return;
}

fetch('/admin/reset', {
method: 'POST',
headers: {
    'Content-Type': 'application/json'
},
body: JSON.stringify({
    confirm_password: password
})
})
.then(response => response.json())
.then(data => {
if (data.success) {
    showMessage('系统重置成功！页面将在3秒后刷新...', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 3000);
} else {
    showMessage('系统重置失败: ' + data.error, 'error');
}
})
.catch(error => {
showMessage('系统重置失败: ' + error.message, 'error');
});
}