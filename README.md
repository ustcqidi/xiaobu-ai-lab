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

## 数理化实验参考

- [PhET 互动模拟（物理）](https://phet.colorado.edu/en/simulations/filter?subjects=physics&type=html) — 科罗拉多大学出品的免费互动实验，覆盖力学、光学、电学等；可作为虚拟实验台的交互设计与实验选题参考。
- [PhET 声波 Sound Waves](https://phet.colorado.edu/sims/html/sound-waves/latest/sound-waves_all.html) — 声音相关实验：可视化声波的振动、频率、振幅与传播，对应八年级「声的世界」（音调/响度/声速）。
- 也可在 PhET 站内切换 Chemistry / Math 分类，作为后续化学、数学可视化实验的灵感来源。

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
