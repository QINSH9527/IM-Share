from flask import Flask, request, render_template, send_from_directory, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
import os
import uuid
import secrets
from datetime import datetime, timedelta
import threading
import time
import json
from werkzeug.utils import secure_filename
import ipaddress
from functools import wraps

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB limit
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///files.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = secrets.token_hex(32)  # 用于session

db = SQLAlchemy(app)

class File(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    original_filename = db.Column(db.String(255), nullable=False)
    filename_on_disk = db.Column(db.String(255), nullable=False)
    extract_code = db.Column(db.String(6), unique=True, nullable=False)
    delete_code = db.Column(db.String(16), unique=True, nullable=False)
    upload_time = db.Column(db.DateTime, nullable=False, default=datetime.now)
    expires_at = db.Column(db.DateTime, nullable=False)
    max_downloads = db.Column(db.Integer, nullable=False, default=1)
    current_downloads = db.Column(db.Integer, nullable=False, default=0)

class SiteConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

class IPAccessControl(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False)  # 支持IPv6
    ip_range = db.Column(db.String(45), nullable=False)    # CIDR格式，如192.168.1.0/24
    access_type = db.Column(db.String(10), nullable=False)  # 'whitelist' 或 'blacklist'
    description = db.Column(db.String(255))  # 描述
    created_at = db.Column(db.DateTime, default=datetime.now)
    is_active = db.Column(db.Boolean, default=True)
    
    __table_args__ = (db.UniqueConstraint('ip_range', 'access_type'),)

# 默认配置
DEFAULT_CONFIGS = {
    'site_title': '老默闪传',
    'site_subtitle': 'IM\'Share',
    'logo_url': 'https://t1.chatglm.cn/file/69489d77b44e1ccbdd36ec33.jpg?expired_at=1766798591&sign=111a030268889d9ca5fdf6ed91984dff&ext=jpg',
    'max_upload_size': '50',  # MB
    'allowed_extensions': 'jpg,jpeg,png,gif,pdf,doc,docx,xls,xlsx,ppt,pptx,txt,zip,rar,mp4,mp3',
    'max_downloads': '10',
    'max_expire_hours': '72',
    'footer_text': '发送违法、违规等有害信息，会受到司法严惩。',
    'header_text': '简单快速，安全可靠的文件传输服务',
    'admin_password': 'admin123',  # 默认密码，首次登录后应修改
    'upload_folder': 'uploads',
    'ip_access_enabled': 'false',  # 是否启用IP访问控制
    'default_access_policy': 'allow',  # 默认策略：allow 或 deny
    'log_ip_access': 'true',  # 是否记录IP访问日志
}

def get_config(key, default=None):
    """获取配置值"""
    config = SiteConfig.query.filter_by(key=key).first()
    if config:
        return config.value
    elif key in DEFAULT_CONFIGS:
        return DEFAULT_CONFIGS[key]
    return default

def set_config(key, value):
    """设置配置值"""
    config = SiteConfig.query.filter_by(key=key).first()
    if config:
        config.value = value
        config.updated_at = datetime.now()
    else:
        config = SiteConfig(key=key, value=value)
        db.session.add(config)
    db.session.commit()

def init_default_configs():
    """初始化默认配置"""
    for key, value in DEFAULT_CONFIGS.items():
        if not SiteConfig.query.filter_by(key=key).first():
            db.session.add(SiteConfig(key=key, value=value))
    db.session.commit()

def is_ip_allowed(client_ip):
    """检查IP是否被允许访问"""
    if not get_config('ip_access_enabled', 'false').lower() == 'true':
        return True
    
    try:
        client_ip_obj = ipaddress.ip_address(client_ip)
        default_policy = get_config('default_access_policy', 'allow')
        
        # 检查黑名单
        blacklist_entries = IPAccessControl.query.filter_by(
            access_type='blacklist', 
            is_active=True
        ).all()
        
        for entry in blacklist_entries:
            try:
                network = ipaddress.ip_network(entry.ip_range, strict=False)
                if client_ip_obj in network:
                    if get_config('log_ip_access', 'true').lower() == 'true':
                        print(f"IP {client_ip} 被黑名单拒绝: {entry.ip_range}")
                    return False
            except ValueError:
                continue
        
        # 检查白名单
        whitelist_entries = IPAccessControl.query.filter_by(
            access_type='whitelist', 
            is_active=True
        ).all()
        
        if whitelist_entries:
            for entry in whitelist_entries:
                try:
                    network = ipaddress.ip_network(entry.ip_range, strict=False)
                    if client_ip_obj in network:
                        if get_config('log_ip_access', 'true').lower() == 'true':
                            print(f"IP {client_ip} 被白名单允许: {entry.ip_range}")
                        return True
                except ValueError:
                    continue
            # 如果有白名单但IP不在任何白名单中，则拒绝
            if get_config('log_ip_access', 'true').lower() == 'true':
                print(f"IP {client_ip} 不在任何白名单中，拒绝访问")
            return False
        
        # 如果没有白名单，使用默认策略
        return default_policy == 'allow'
        
    except ValueError:
        # IP地址格式错误，使用默认策略
        return get_config('default_access_policy', 'allow') == 'allow'

def ip_access_required(f):
    """IP访问控制装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
        
        # 如果是多个IP（通过代理），取第一个
        if ',' in client_ip:
            client_ip = client_ip.split(',')[0].strip()
        
        if not is_ip_allowed(client_ip):
            return jsonify({'error': '访问被拒绝'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

def get_client_ip():
    """获取客户端真实IP"""
    # 检查各种可能的代理头
    ip_headers = [
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'HTTP_CLIENT_IP',
        'HTTP_X_FORWARDED',
        'HTTP_X_CLUSTER_CLIENT_IP',
        'HTTP_FORWARDED_FOR',
        'HTTP_FORWARDED',
        'REMOTE_ADDR'
    ]
    
    for header in ip_headers:
        ip = request.environ.get(header)
        if ip:
            # 如果有多个IP，取第一个
            if ',' in ip:
                ip = ip.split(',')[0].strip()
            return ip
    
    return 'unknown'

def generate_codes():
    """生成提取码和删除码"""
    while True:
        extract_code = secrets.token_urlsafe(4)[:6].upper()
        if not File.query.filter_by(extract_code=extract_code).first():
            break
            
    while True:
        delete_code = secrets.token_urlsafe(12)
        if not File.query.filter_by(delete_code=delete_code).first():
            break
            
    return extract_code, delete_code

# 路由定义
@app.route('/')
@ip_access_required
def home():
    return render_template('index.html', 
                        site_title=get_config('site_title'),
                        site_subtitle=get_config('site_subtitle'),
                        logo_url=get_config('logo_url'),
                        header_text=get_config('header_text'),
                        footer_text=get_config('footer_text'))

@app.route('/admin')
def admin():
    if not session.get('admin_logged_in'):
        return redirect(url_for('admin_login'))
    return render_template('admin.html')

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        password = request.form.get('password')
        if password == get_config('admin_password'):
            session['admin_logged_in'] = True
            session.permanent = True
            return redirect(url_for('admin'))
        else:
            return render_template('admin_login.html', error='密码错误')
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('home'))

@app.route('/admin/config', methods=['GET', 'POST'])
def admin_config():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    if request.method == 'GET':
        configs = {}
        for key in DEFAULT_CONFIGS.keys():
            configs[key] = get_config(key)
        return jsonify(configs)
    
    elif request.method == 'POST':
        data = request.get_json()
        for key, value in data.items():
            if key in DEFAULT_CONFIGS:
                set_config(key, value)
        return jsonify({'success': True})

@app.route('/admin/upload-logo', methods=['POST'])
def admin_upload_logo():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    if 'logo' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['logo']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400
    
    # 检查文件类型
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if not ('.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
        return jsonify({'error': '只允许上传图片文件'}), 400
    
    # 生成唯一文件名
    filename = secure_filename(file.filename)
    unique_filename = f"logo_{uuid.uuid4().hex}.{filename.rsplit('.', 1)[1]}"
    
    # 使用 static/img 目录
    img_folder = os.path.join('static', 'img')
    if not os.path.exists(img_folder):
        os.makedirs(img_folder)
    
    # 保存文件到 static/img
    file_path = os.path.join(img_folder, unique_filename)
    file.save(file_path)
    
    # 更新配置，使用静态文件路径
    logo_url = f"/static/img/{unique_filename}"
    set_config('logo_url', logo_url)
    
    return jsonify({'success': True, 'logo_url': logo_url})

@app.route('/admin/cleanup', methods=['POST'])
def admin_cleanup():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    try:
        with app.app_context():
            cleanup_count = 0
            upload_folder = get_config('upload_folder', 'uploads')
            
            # 清理孤立的文件（在磁盘上但不在数据库中的文件）
            if os.path.exists(upload_folder):
                all_files = File.query.all()
                db_files = set(f.filename_on_disk for f in all_files)
                disk_files = set(os.listdir(upload_folder))
                orphaned_files = disk_files - db_files
                
                for orphaned_file in orphaned_files:
                    file_path = os.path.join(upload_folder, orphaned_file)
                    try:
                        os.remove(file_path)
                        cleanup_count += 1
                        print(f"清理孤立文件: {orphaned_file}")
                    except Exception as e:
                        print(f"清理文件 {orphaned_file} 时出错: {e}")
            
            # 清理 static/img 文件夹中的孤立LOGO
            img_folder = os.path.join('static', 'img')
            if os.path.exists(img_folder):
                current_logo_url = get_config('logo_url', '')
                current_logo_name = current_logo_url.split('/')[-1] if current_logo_url else ''
                
                for img_file in os.listdir(img_folder):
                    # 只清理 logo_ 开头的文件，避免误删其他图片
                    if img_file.startswith('logo_') and img_file != current_logo_name:
                        img_path = os.path.join(img_folder, img_file)
                        try:
                            os.remove(img_path)
                            cleanup_count += 1
                            print(f"清理孤立LOGO: {img_file}")
                        except Exception as e:
                            print(f"清理LOGO {img_file} 时出错: {e}")
            
            return jsonify({'success': True, 'cleanup_count': cleanup_count})
    
    except Exception as e:
        return jsonify({'error': f'清理失败: {str(e)}'}), 500

@app.route('/admin/reset', methods=['POST'])
def admin_reset():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    try:
        with app.app_context():
            # 确认密码（防止误操作）
            data = request.get_json()
            if not data or data.get('confirm_password') != get_config('admin_password'):
                return jsonify({'error': '确认密码错误'}), 400
            
            # 清空所有文件记录
            File.query.delete()
            
            # 重置配置为默认值（除了管理员密码）
            for key, value in DEFAULT_CONFIGS.items():
                if key != 'admin_password':
                    set_config(key, value)
            
            # 清理上传文件夹
            upload_folder = get_config('upload_folder', 'uploads')
            if os.path.exists(upload_folder):
                import shutil
                shutil.rmtree(upload_folder)
                os.makedirs(upload_folder)
            
            # 清理 static/img 文件夹中的LOGO文件
            img_folder = os.path.join('static', 'img')
            if os.path.exists(img_folder):
                for img_file in os.listdir(img_folder):
                    if img_file.startswith('logo_'):
                        img_path = os.path.join(img_folder, img_file)
                        try:
                            os.remove(img_path)
                            print(f"重置时删除LOGO: {img_file}")
                        except Exception as e:
                            print(f"删除LOGO {img_file} 时出错: {e}")
            
            db.session.commit()
            
            return jsonify({'success': True})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'重置失败: {str(e)}'}), 500

@app.route('/admin/stats', methods=['GET'])
def admin_stats():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    try:
        with app.app_context():
            # 统计信息
            total_files = File.query.count()
            active_files = File.query.filter(
                File.expires_at > datetime.now(),
                File.current_downloads < File.max_downloads
            ).count()
            expired_files = File.query.filter(File.expires_at <= datetime.now()).count()
            limit_reached_files = File.query.filter(
                File.current_downloads >= File.max_downloads
            ).count()
            
            # 计算总文件大小（只计算uploads文件夹）
            upload_folder = get_config('upload_folder', 'uploads')
            total_size = 0
            if os.path.exists(upload_folder):
                for root, dirs, files in os.walk(upload_folder):
                    for file in files:
                        file_path = os.path.join(root, file)
                        if os.path.exists(file_path):
                            total_size += os.path.getsize(file_path)
            
            # 计算LOGO文件大小和数量
            img_folder = os.path.join('static', 'img')
            logo_count = 0
            logo_size = 0
            if os.path.exists(img_folder):
                for img_file in os.listdir(img_folder):
                    if img_file.startswith('logo_'):
                        logo_count += 1
                        img_path = os.path.join(img_folder, img_file)
                        if os.path.exists(img_path):
                            logo_size += os.path.getsize(img_path)
            
            # 格式化文件大小
            def format_size(size):
                for unit in ['B', 'KB', 'MB', 'GB']:
                    if size < 1024:
                        return f"{size:.2f} {unit}"
                    size /= 1024
                return f"{size:.2f} TB"
            
            return jsonify({
                'total_files': total_files,
                'active_files': active_files,
                'expired_files': expired_files,
                'limit_reached_files': limit_reached_files,
                'total_size': format_size(total_size),
                'upload_folder': upload_folder,
                'logo_count': logo_count,
                'logo_size': format_size(logo_size),
                'img_folder': img_folder
            })
    
    except Exception as e:
        return jsonify({'error': f'获取统计信息失败: {str(e)}'}), 500

# IP访问控制管理路由 - 修复路由定义
@app.route('/admin/ip-access', methods=['GET', 'POST'])
@ip_access_required
def admin_ip_access():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    if request.method == 'GET':
        # 返回HTML页面而不是JSON
        return render_template('admin_ip.html')
    
    elif request.method == 'POST':
        # 处理AJAX请求，返回JSON
        data = request.get_json()
        action = data.get('action')
        
        if action == 'add':
            # 添加新的IP访问控制规则
            ip_range = data.get('ip_range', '').strip()
            access_type = data.get('access_type')
            description = data.get('description', '')
            
            if not ip_range or access_type not in ['whitelist', 'blacklist']:
                return jsonify({'error': '参数错误'}), 400
            
            # 验证IP范围格式
            try:
                network = ipaddress.ip_network(ip_range, strict=False)
                ip_address = str(network.network_address)
            except ValueError:
                return jsonify({'error': '无效的IP范围格式'}), 400
            
            # 检查是否已存在
            existing = IPAccessControl.query.filter_by(
                ip_range=ip_range, 
                access_type=access_type
            ).first()
            if existing:
                return jsonify({'error': '该IP范围已存在'}), 400
            
            # 创建新规则
            new_rule = IPAccessControl(
                ip_address=ip_address,
                ip_range=ip_range,
                access_type=access_type,
                description=description
            )
            db.session.add(new_rule)
            db.session.commit()
            
            return jsonify({'success': True, 'message': 'IP访问控制规则添加成功'})
        
        elif action == 'delete':
            # 删除IP访问控制规则
            rule_id = data.get('rule_id')
            if not rule_id:
                return jsonify({'error': '规则ID不能为空'}), 400
            
            rule = IPAccessControl.query.get(rule_id)
            if not rule:
                return jsonify({'error': '规则不存在'}), 404
            
            db.session.delete(rule)
            db.session.commit()
            
            return jsonify({'success': True, 'message': 'IP访问控制规则删除成功'})
        
        elif action == 'toggle':
            # 启用/禁用IP访问控制规则
            rule_id = data.get('rule_id')
            if not rule_id:
                return jsonify({'error': '规则ID不能为空'}), 400
            
            rule = IPAccessControl.query.get(rule_id)
            if not rule:
                return jsonify({'error': '规则不存在'}), 404
            
            rule.is_active = not rule.is_active
            db.session.commit()
            
            status = '启用' if rule.is_active else '禁用'
            return jsonify({'success': True, 'message': f'规则已{status}'})
        
        elif action == 'update_config':
            # 更新IP访问控制配置
            enabled = data.get('enabled', False)
            default_policy = data.get('default_policy', 'allow')
            log_access = data.get('log_access', True)
            
            set_config('ip_access_enabled', str(enabled).lower())
            set_config('default_access_policy', default_policy)
            set_config('log_ip_access', str(log_access).lower())
            
            return jsonify({'success': True, 'message': '配置更新成功'})
        
        else:
            return jsonify({'error': '未知操作'}), 400

# 添加一个单独的API路由用于获取配置数据
@app.route('/admin/ip-access-data', methods=['GET'])
@ip_access_required
def admin_ip_access_data():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    # 获取所有IP访问控制规则
    rules = IPAccessControl.query.order_by(IPAccessControl.created_at.desc()).all()
    rules_list = []
    for rule in rules:
        rules_list.append({
            'id': rule.id,
            'ip_address': rule.ip_address,
            'ip_range': rule.ip_range,
            'access_type': rule.access_type,
            'description': rule.description,
            'created_at': rule.created_at.isoformat(),
            'is_active': rule.is_active
        })
    
    return jsonify({
        'rules': rules_list,
        'enabled': get_config('ip_access_enabled', 'false') == 'true',
        'default_policy': get_config('default_access_policy', 'allow'),
        'log_access': get_config('log_ip_access', 'true') == 'true'
    })



# 获取当前客户端IP信息 - 修复路由定义
@app.route('/admin/current-ip', methods=['GET'])
@ip_access_required
def admin_current_ip():
    if not session.get('admin_logged_in'):
        return jsonify({'error': '未登录'}), 401
    
    client_ip = get_client_ip()
    return jsonify({
        'current_ip': client_ip,
        'is_allowed': is_ip_allowed(client_ip)
    })

@app.route('/upload', methods=['POST'])
@ip_access_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '没有文件部分'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400

    # 获取配置的限制
    max_upload_size = int(get_config('max_upload_size', '50')) * 1024 * 1024
    allowed_extensions = get_config('allowed_extensions', '').split(',')
    max_downloads = int(request.form.get('max_downloads', get_config('max_downloads', '10')))
    expire_hours = int(request.form.get('expire_hours', get_config('max_expire_hours', '72')))
    
    # 关键修复：先检查文件大小
    file_content = file.read()
    if len(file_content) > max_upload_size:
        return jsonify({'error': f'文件大小超过限制（{max_upload_size // (1024*1024)}MB）'}), 400
    
    # 重置文件指针
    file.seek(0)
    
    # 检查文件扩展名
    if not file.filename or '.' not in file.filename:
        return jsonify({'error': '文件名无效'}), 400
    
    file_extension = file.filename.rsplit('.', 1)[1].lower()
    if allowed_extensions and file_extension not in allowed_extensions:
        return jsonify({'error': f'不支持的文件类型：{file_extension}，支持的类型：{", ".join(allowed_extensions)}'}), 400

    try:
        extract_code, delete_code = generate_codes()
        file_id = uuid.uuid4().hex
        filename_on_disk = f"{file_id}"
        upload_folder = get_config('upload_folder', 'uploads')
        save_path = os.path.join(upload_folder, filename_on_disk)
        
        # 确保上传目录存在
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        
        file.save(save_path)

        new_file = File(
            original_filename=file.filename,
            filename_on_disk=filename_on_disk,
            extract_code=extract_code,
            delete_code=delete_code,
            expires_at=datetime.now() + timedelta(hours=expire_hours),
            max_downloads=max_downloads
        )
        
        db.session.add(new_file)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'extract_code': extract_code,
            'delete_code': delete_code,
            'filename': file.filename
        })
    except Exception as e:
        return jsonify({'error': f'上传失败：{str(e)}'}), 500

@app.route('/d/<code>', methods=['GET'])
@ip_access_required
def download_or_delete_file(code):
    print(f"收到请求: {code}, 时间: {datetime.now()}")
    
    # 先检查是否是删除码
    file_record = File.query.filter_by(delete_code=code).first()
    if file_record:
        print("这是删除码请求")
        # 删除文件
        try:
            upload_folder = get_config('upload_folder', 'uploads')
            file_path = os.path.join(upload_folder, file_record.filename_on_disk)
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"用户主动删除文件: {file_record.original_filename}")
        except Exception as e:
            print(f"删除文件时出错: {e}")
        
        db.session.delete(file_record)
        db.session.commit()
        return jsonify({'message': '文件删除成功'}), 200
    
    # 如果不是删除码，检查是否是提取码
    file_record = File.query.filter_by(extract_code=code).first()
    if not file_record:
        print("无效的提取码或删除码")
        return jsonify({'error': '无效的提取码或删除码'}), 404

    print(f"找到文件: {file_record.original_filename}, 当前下载次数: {file_record.current_downloads}/{file_record.max_downloads}")

    # 检查文件是否过期
    if datetime.now() > file_record.expires_at:
        print("文件已过期")
        return jsonify({'error': '文件已过期'}), 410

    # 检查下载次数限制
    if file_record.current_downloads >= file_record.max_downloads:
        print("已达到最大下载次数")
        return jsonify({'error': '已达到最大下载次数'}), 409

    # 检查文件是否真实存在
    upload_folder = get_config('upload_folder', 'uploads')
    file_path = os.path.join(upload_folder, file_record.filename_on_disk)
    if not os.path.exists(file_path):
        print("文件不存在")
        # 如果文件不存在，清理数据库记录
        db.session.delete(file_record)
        db.session.commit()
        return jsonify({'error': '文件不存在'}), 404

    # 使用数据库锁来确保原子性操作
    try:
        # 获取数据库锁
        locked_record = File.query.filter_by(id=file_record.id).with_for_update().first()
        
        if not locked_record:
            print("无法获取锁")
            return jsonify({'error': '文件不存在'}), 404
        
        print(f"获取锁成功，当前下载次数: {locked_record.current_downloads}/{locked_record.max_downloads}")
        
        # 再次检查下载次数限制（在锁的保护下）
        if locked_record.current_downloads >= locked_record.max_downloads:
            print("已达到最大下载次数")
            return jsonify({'error': '已达到最大下载次数'}), 409
        
        # 更新下载次数
        old_count = locked_record.current_downloads
        locked_record.current_downloads += 1
        new_count = locked_record.current_downloads
        
        db.session.commit()
        
        print(f"更新下载次数: {old_count} -> {new_count}")
        
        # 返回文件
        return send_from_directory(
            upload_folder, 
            locked_record.filename_on_disk, 
            as_attachment=True, 
            download_name=locked_record.original_filename
        )
        
    except Exception as e:
        db.session.rollback()
        print(f"下载时出错: {e}")
        return jsonify({'error': f'下载失败: {str(e)}'}), 500

@app.route('/file-info/<code>', methods=['GET'])
@ip_access_required
def get_file_info(code):
    file_record = File.query.filter_by(extract_code=code).first()
    if not file_record:
        return jsonify({'error': '无效的提取码'}), 404
    
    # 检查文件是否过期
    if datetime.now() > file_record.expires_at:
        return jsonify({'error': '文件已过期'}), 410
    
    # 检查是否达到下载次数限制
    if file_record.current_downloads >= file_record.max_downloads:
        return jsonify({'error': '已达到最大下载次数'}), 409
    
    # 检查文件是否真实存在
    upload_folder = get_config('upload_folder', 'uploads')
    file_path = os.path.join(upload_folder, file_record.filename_on_disk)
    if not os.path.exists(file_path):
        # 如果文件不存在，清理数据库记录
        db.session.delete(file_record)
        db.session.commit()
        return jsonify({'error': '文件不存在'}), 404
    
    return jsonify({
        'filename': file_record.original_filename
    })

def cleanup_expired_and_limit_reached_files():
    """定期清理过期和达到下载限制的文件"""
    while True:
        try:
            with app.app_context():
                now = datetime.now()
                files_to_delete = []
                upload_folder = get_config('upload_folder', 'uploads')
                
                # 查找所有需要删除的文件
                all_files = File.query.all()
                for file_record in all_files:
                    should_delete = False
                    reason = ""
                    
                    # 检查是否过期
                    if now > file_record.expires_at:
                        should_delete = True
                        reason = "分享时限已到"
                    
                    # 检查是否达到下载次数限制
                    elif file_record.current_downloads >= file_record.max_downloads:
                        should_delete = True
                        reason = "达到最大下载次数"
                    
                    if should_delete:
                        files_to_delete.append((file_record, reason))
                
                # 删除文件和数据库记录
                for file_record, reason in files_to_delete:
                    try:
                        file_path = os.path.join(upload_folder, file_record.filename_on_disk)
                        if os.path.exists(file_path):
                            os.remove(file_path)
                            print(f"删除文件: {file_record.original_filename} (原因: {reason})")
                        
                        db.session.delete(file_record)
                    except Exception as e:
                        print(f"删除文件 {file_record.original_filename} 时出错: {e}")
                
                if files_to_delete:
                    db.session.commit()
                    print(f"清理完成，共删除 {len(files_to_delete)} 个文件")
                
        except Exception as e:
            print(f"定期清理时出错: {e}")
        
        # 每5分钟执行一次清理
        time.sleep(300)

def startup_cleanup():
    """启动时清理孤立文件"""
    try:
        with app.app_context():
            # 初始化默认配置
            init_default_configs()
            
            # 检查数据库中的文件是否都存在
            all_files = File.query.all()
            upload_folder = get_config('upload_folder', 'uploads')
            for file_record in all_files:
                file_path = os.path.join(upload_folder, file_record.filename_on_disk)
                if not os.path.exists(file_path):
                    print(f"发现孤立的数据库记录: {file_record.original_filename}，文件不存在，删除记录")
                    db.session.delete(file_record)
            
            # 检查uploads目录中的文件是否都有数据库记录
            if os.path.exists(upload_folder):
                disk_files = set(os.listdir(upload_folder))
                db_files = set(f.filename_on_disk for f in all_files)
                orphaned_files = disk_files - db_files
                
                for orphaned_file in orphaned_files:
                    file_path = os.path.join(upload_folder, orphaned_file)
                    try:
                        os.remove(file_path)
                        print(f"发现孤立的文件: {orphaned_file}，删除文件")
                    except Exception as e:
                        print(f"删除孤立文件 {orphaned_file} 时出错: {e}")
            
            if len(all_files) != File.query.count() or orphaned_files:
                db.session.commit()
                print("启动清理完成")
                
    except Exception as e:
        print(f"启动清理时出错: {e}")

# 启动定期清理线程
cleanup_thread = threading.Thread(target=cleanup_expired_and_limit_reached_files, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    # 确保所有必要的文件夹存在
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    
    # 确保静态文件文件夹存在
    if not os.path.exists('static'):
        os.makedirs('static')
    if not os.path.exists('static/css'):
        os.makedirs('static/css')
    if not os.path.exists('static/js'):
        os.makedirs('static/js')
    if not os.path.exists('static/img'):
        os.makedirs('static/img')
        
    with app.app_context():
        db.create_all()
        
        # 执行启动清理
        startup_cleanup()
        
    print("老默闪传服务启动中...")
    print("定期清理任务已启动，每5分钟执行一次")
    print("文件只根据分享时限和下载次数限制进行清理")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
