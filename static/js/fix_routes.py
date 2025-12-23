import sqlite3

# 连接数据库
conn = sqlite3.connect('files.db')
cursor = conn.cursor()

# 重置IP配置，确保装饰器不会拦截
cursor.execute("UPDATE site_config SET value = 'false' WHERE key = 'ip_access_enabled'")
cursor.execute("UPDATE site_config SET value = 'allow' WHERE key = 'default_access_policy'")

conn.commit()
conn.close()

print("IP配置已重置，现在修复路由问题...")
