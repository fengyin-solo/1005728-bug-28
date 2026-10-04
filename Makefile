.PHONY: install seed setup smoke frontend build

install:
	cd frontend && npm install

seed:
	cd frontend && npm run seed

smoke:
	cd frontend && npm run smoke

# 一条命令备齐本机开发环境：依赖 + 示例数据
setup:
	cd frontend && npm run setup

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
