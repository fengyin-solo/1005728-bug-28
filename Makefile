.PHONY: install setup frontend build

install:
	cd frontend && npm install

# 本机开发环境一键备齐：依赖与示例数据自检一并完成。
setup:
	cd frontend && npm run setup

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
