let uploadHistory = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
let downloadHistory = JSON.parse(localStorage.getItem('downloadHistory') || '[]');
let uploadDisplayedCount = 5;
let downloadDisplayedCount = 5;
let uploadLoading = false;
let downloadLoading = false;

function showPage(page) {
    document.getElementById('main-page').style.display = 'none';
    document.getElementById('history-page').style.display = 'none';
    
    document.getElementById(page + '-page').style.display = 'block';
    
    // 更新导航状态
    const navLinks = document.querySelectorAll('.nav a');
    navLinks.forEach(link => link.classList.remove('active'));
    event.target.classList.add('active');
    
    // 如果是历史记录页面，更新内容
    if (page === 'history') {
        updateHistoryPage();
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 显示文件信息
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`上传文件: ${file.name}, 大小:${fileSizeMB}MB`);

    // 预先检查文件大小（可选，作为前端验证）
    const maxSizeMB = 50; // 与后端配置一致
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        showError(`文件大小超过限制（最大 ${maxSizeMB}MB）`);
        event.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('max_downloads', document.getElementById('max_downloads').value || 1);
    formData.append('expire_hours', document.getElementById('expire_hours').value || 24);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        // 检查响应状态
        if (!response.ok) {
            // 尝试获取错误信息
            const contentType = response.headers.get('content-type');
            let errorMessage = `上传失败 (${response.status})`;
            
            try {
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    // 如果不是JSON，可能是HTML错误页面
                    const errorText = await response.text();
                    if (errorText.includes('413') || errorText.includes('Request Entity Too Large')) {
                        errorMessage = '文件大小超过限制（最大 50MB）';
                    } else if (errorText.includes('415') || errorText.includes('Unsupported Media Type')) {
                        errorMessage = '不支持的文件类型';
                    }
                }
            } catch (e) {
                console.warn('无法解析错误响应:', e);
            }
            
            throw new Error(errorMessage);
        }
        
        // 如果响应正常，尝试解析JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('服务器返回非JSON响应:', text);
            throw new Error('服务器响应格式错误');
        }
        
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // 设置提取码和删除码
            document.getElementById('extract-code-text').textContent = data.extract_code;
            document.getElementById('delete-code-text').textContent = data.delete_code;
            
            // 设置提取码为已自动复制状态
            const extractIndicator = document.getElementById('extract-copy-indicator');
            extractIndicator.textContent = '已自动复制';
            extractIndicator.className = 'copy-indicator';
            
            // 设置删除码为待复制状态
            const deleteIndicator = document.getElementById('delete-copy-indicator');
            deleteIndicator.textContent = '点击复制';
            deleteIndicator.className = 'copy-indicator pending';
            
            // 显示弹窗
            document.getElementById('success-modal').style.display = 'flex';
            
            // 自动复制提取码
            navigator.clipboard.writeText(data.extract_code).then(() => {
                console.log('提取码已自动复制到剪贴板');
            });
            
            // 添加到上传历史
            const newUpload = {
                id: Date.now(),
                filename: data.filename,
                extractCode: data.extract_code,
                deleteCode: data.delete_code,
                time: new Date().toLocaleString()
            };
            uploadHistory.unshift(newUpload);
            localStorage.setItem('uploadHistory', JSON.stringify(uploadHistory));
        } else {
            showError('上传失败: ' + (data.error || '未知错误'));
        }
    })
    .catch(error => {
        console.error('上传错误详情:', error);
        showError('上传过程中发生错误: ' + error.message);
    })
    .finally(() => {
        // 重置文件输入
        event.target.value = '';
    });
}


function updateButtonText() {
    const deleteCode = document.getElementById('delete-code').value;
    const actionButton = document.getElementById('action-button');
    if (deleteCode) {
        actionButton.textContent = '删除文件';
        actionButton.className = 'btn btn-danger';
    } else {
        actionButton.textContent = '下载文件';
        actionButton.className = 'btn btn-primary';
    }
}

function handleReceive() {
    const extractCode = document.getElementById('extract-code').value;
    const deleteCode = document.getElementById('delete-code').value;
    const errorDiv = document.getElementById('receive-error');
    const successDiv = document.getElementById('receive-success');
    
    // 隐藏之前的消息
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!extractCode && !deleteCode) {
        showError('请输入提取码或删除码');
        return;
    }
    
    const code = extractCode || deleteCode;
    
    // 先获取文件信息，再决定如何处理
    fetch(`/file-info/${code}`)
    .then(async response => {
        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            let errorMessage = `获取文件信息失败 (${response.status})`;
            
            try {
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                }
            } catch (e) {
                console.warn('无法解析错误响应:', e);
            }
            
            throw new Error(errorMessage);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('服务器返回非JSON响应:', text);
            throw new Error('服务器响应格式错误');
        }
        
        return response.json();
    })
    .then(data => {
        if (data.error) {
            // 如果获取文件信息失败，可能是删除码，尝试删除
            fetch(`/d/${code}`)
            .then(async response => {
                if (!response.ok) {
                    const contentType = response.headers.get('content-type');
                    let errorMessage = `操作失败 (${response.status})`;
                    
                    try {
                        if (contentType && contentType.includes('application/json')) {
                            const errorData = await response.json();
                            errorMessage = errorData.error || errorMessage;
                        }
                    } catch (e) {
                        console.warn('无法解析错误响应:', e);
                    }
                    
                    throw new Error(errorMessage);
                }
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error('服务器返回非JSON响应:', text);
                    throw new Error('服务器响应格式错误');
                }
                
                return response.json();
            })
            .then(deleteData => {
                if (deleteData.message) {
                    showSuccess(deleteData.message);
                    
                    // 从上传历史中移除
                    uploadHistory = uploadHistory.filter(item => 
                        item.extractCode !== extractCode && item.deleteCode !== deleteCode
                    );
                    localStorage.setItem('uploadHistory', JSON.stringify(uploadHistory));
                    
                    // 清空输入框
                    document.getElementById('extract-code').value = '';
                    document.getElementById('delete-code').value = '';
                    updateButtonText();
                } else {
                    showError(deleteData.error || '操作失败');
                }
            })
            .catch(error => {
                showError('操作过程中发生错误: ' + error.message);
            });
        } else {
            // 这是提取码，直接下载文件
            // 创建下载链接，避免重复请求
            const a = document.createElement('a');
            a.href = `/d/${code}`;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 添加到下载历史
            const newDownload = {
                id: Date.now(),
                filename: data.filename,
                time: new Date().toLocaleString()
            };
            downloadHistory.unshift(newDownload);
            localStorage.setItem('downloadHistory', JSON.stringify(downloadHistory));
            
            // 清空输入框
            document.getElementById('extract-code').value = '';
            document.getElementById('delete-code').value = '';
            updateButtonText();
        }
    })
    .catch(error => {
        showError('获取文件信息时发生错误: ' + error.message);
    });
}


function updateHistoryPage() {
    updateUploadHistory();
    updateDownloadHistory();
}

function updateUploadHistory() {
    const content = document.getElementById('upload-history-content');
    
    if (uploadHistory.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i>📂</i>
                <p>暂无上传记录</p>
            </div>
        `;
        return;
    }
    
    const items = uploadHistory.slice(0, uploadDisplayedCount);
    
    let html = '';
    items.forEach(item => {
        html += `
            <div class="history-item">
                <div class="history-filename">${item.filename}</div>
                <div class="history-time">${item.time}</div>
                <div class="history-actions">
                    <div class="copyable-code" onclick="copyHistoryCode('${item.extractCode}', '提取码')">
                        提取码: ${item.extractCode}
                        <span class="copy-tooltip">点击复制</span>
                    </div>
                    <div class="copyable-code delete-code" onclick="copyHistoryCode('${item.deleteCode}', '删除码')">
                        删除码: ${item.deleteCode}
                        <span class="copy-tooltip">点击复制</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    content.innerHTML = html;
    
    // 如果还有更多记录，显示加载指示器
    if (uploadHistory.length > uploadDisplayedCount) {
        document.getElementById('upload-loading').classList.add('active');
    } else {
        document.getElementById('upload-loading').classList.remove('active');
    }
}

function updateDownloadHistory() {
    const content = document.getElementById('download-history-content');
    
    if (downloadHistory.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i>💾</i>
                <p>暂无下载记录</p>
            </div>
        `;
        return;
    }
    
    const items = downloadHistory.slice(0, downloadDisplayedCount);
    
    let html = '';
    items.forEach(item => {
        html += `
            <div class="history-item download-item">
                <div class="history-filename">${item.filename}</div>
                <div class="history-time">${item.time}</div>
            </div>
        `;
    });
    
    content.innerHTML = html;
    
    // 如果还有更多记录，显示加载指示器
    if (downloadHistory.length > downloadDisplayedCount) {
        document.getElementById('download-loading').classList.add('active');
    } else {
        document.getElementById('download-loading').classList.remove('active');
    }
}

function handleScroll(type, element) {
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    
    // 当滚动到底部附近时加载更多
    if (scrollTop + clientHeight >= scrollHeight - 50) {
        if (type === 'upload' && !uploadLoading && uploadHistory.length > uploadDisplayedCount) {
            uploadLoading = true;
            setTimeout(() => {
                uploadDisplayedCount += 5;
                updateUploadHistory();
                uploadLoading = false;
            }, 500);
        } else if (type === 'download' && !downloadLoading && downloadHistory.length > downloadDisplayedCount) {
            downloadLoading = true;
            setTimeout(() => {
                downloadDisplayedCount += 5;
                updateDownloadHistory();
                downloadLoading = false;
            }, 500);
        }
    }
}

function goToAdmin() {
    window.location.href = '/admin';
}

function closeModal() {
    document.getElementById('success-modal').style.display = 'none';
}

function copyExtractCode() {
    const code = document.getElementById('extract-code-text').textContent;
    const indicator = document.getElementById('extract-copy-indicator');
    
    navigator.clipboard.writeText(code).then(() => {
        indicator.textContent = '已复制！';
        indicator.className = 'copy-indicator success';
        
        setTimeout(() => {
            indicator.textContent = '点击复制';
            indicator.className = 'copy-indicator pending';
        }, 2000);
    });
}

function copyDeleteCode() {
    const code = document.getElementById('delete-code-text').textContent;
    const indicator = document.getElementById('delete-copy-indicator');
    
    navigator.clipboard.writeText(code).then(() => {
        indicator.textContent = '已复制！';
        indicator.className = 'copy-indicator success';
        
        setTimeout(() => {
            indicator.textContent = '点击复制';
            indicator.className = 'copy-indicator pending';
        }, 2000);
    });
}

function copyHistoryCode(code, type) {
    navigator.clipboard.writeText(code).then(() => {
        // 创建临时提示
        const tooltip = document.createElement('div');
        tooltip.textContent = `${type}已复制！`;
        tooltip.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--success-color);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(tooltip);
        
        setTimeout(() => {
            tooltip.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(tooltip);
            }, 300);
        }, 1500);
    });
}

function showError(message) {
    const errorDiv = document.getElementById('receive-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.getElementById('receive-success');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => {
        successDiv.style.display = 'none';
    }, 5000);
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 点击空白处关闭弹窗
    document.getElementById('success-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // 拖拽上传功能
    const uploadArea = document.querySelector('.upload-area');
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--secondary-color)';
        uploadArea.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
        uploadArea.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
        uploadArea.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const maxSizeMB = 50;
            
            if (file.size > maxSizeMB * 1024 * 1024) {
                showError(`文件 "${file.name}" 大小${fileSizeMB}MB 超过限制（最大 ${maxSizeMB}MB）`);
                return;
            }
            
            document.getElementById('file-input').files = files;
            handleFileUpload({ target: { files: files } });
        }
    });
});
