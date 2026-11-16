# ThingsDeck server bundle

Pre-built ThingsDeck for a Linux machine with Docker. Nothing is compiled here.

```bash
# 1. Optional: put your company's CA certificate (binary or text) in certs/
# 2. Load the images
gunzip -c thingsdeck-images.tar.gz | docker load
# 3. Start
docker compose up -d
```

Open `http://<this-machine's-IP>:8080`, create an account and choose demo or live.

| Task               | Command                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Status and logs    | `docker compose ps` · `docker compose logs api`                                                                     |
| Stop / start       | `docker compose down` · `docker compose up -d`                                                                      |
| Close registration | add `THINGSDECK_SIGNUP=closed` to `.env`, then `docker compose up -d`                                               |
| Back up accounts   | `docker run --rm -v thingsdeck_data:/data -v "$PWD":/backup busybox tar czf /backup/thingsdeck-data.tgz -C /data .` |
| Update             | load the new `thingsdeck-images.tar.gz`, then `docker compose up -d`                                                |

Settings live in `.env` (see `.env.example`). Containers restart automatically after a reboot.
