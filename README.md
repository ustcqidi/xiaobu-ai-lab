# 小布的 AI 实验室 · Xiaobu AI Lab

祁迪 × 小布 的周末编程项目。用 AI 把想法变成能玩、能动手的东西。

在线访问：部署到 GitHub Pages 后即可打开 `index.html`。

## 项目

| 项目 | 技术 | 入口 |
|------|------|------|
| 身体保卫战（免疫系统塔防） | HTML5 / Canvas | `body-defense/index.html` |
| 中国象棋（搜索 AI + 残局题库） | HTML5 / ES6 模块 / Canvas | `chess/index.html` |
| 初中物理虚拟实验台 | HTML5 / Canvas（单文件） | `physics-lab.html` |

> 化学、数学可视化实验开发中。

## 本地预览

中国象棋使用原生 ES6 模块，`file://` 直接双击会被浏览器拦截，需要通过本地服务器访问：

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

其余项目为单文件，双击即可打开。

## 部署

这是纯静态站点，可直接用 GitHub Pages 部署（Settings → Pages → Deploy from branch → `main` / root）。

---

源文件与教学材料（课程笔记、设计文档、错题本）保存在私有仓库，不在此公开。
