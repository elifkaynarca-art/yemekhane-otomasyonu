# Yemekhane Otomasyonu Dönem Ödevi Raporu
**Öğrenci:** Hatice Elif Kaynarca  
**Seçilen Mimari:** Web API (Express.js Backend + Apache Frontend + Docker Container)

---

## Aşama 1. Altyapı ve Replikasyon Doğrulaması

### 1. Servis Sağlık Durumu (`docker compose ps -a`)
```bash
\$ docker compose ps -a
NAME                IMAGE               COMMAND                  SERVICE             CREATED             STATUS                    PORTS
frontend            apache-frontend     "httpd-foreground -D…"   frontend            2 minutes ago       Up 2 minutes (healthy)    0.0.0.0:8080->80/tcp
mysql-primary       mysql:8.4           "docker-entrypoint.s…"   mysql-primary       2 minutes ago       Up 2 minutes (healthy)    0.0.0.0:3307->3306/tcp
mysql-replica       mysql:8.4           "docker-entrypoint.s…"   mysql-replica       2 minutes ago       Up 2 minutes (healthy)    0.0.0.0:3308->3306/tcp
redis               redis:7-alpine      "docker-entrypoint.s…"   redis               2 minutes ago       Up 2 minutes (healthy)    0.0.0.0:6379->6379/tcp
replica-setup       mysql:8.4           "/bin/bash /db/repli…"   replica-setup       2 minutes ago       Exited (0)                
yemekhane-uygulama  uygulama-uygulama   "npm start"              uygulama            2 minutes ago       Up 2 minutes