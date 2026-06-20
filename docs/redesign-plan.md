# 数理化虚拟实验台重设计方案（参考 PhET）

> 目标：把当前"单静态网页塞所有实验"的物理 / 化学实验台，重构为参考 PhET 的模块化、模型-视图分离、连续可交互的虚拟实验体系。

## 一、现状诊断

| 项目 | 现状 | 问题 |
|------|------|------|
| `physics-lab.html` | 2609 行单文件 | 电/力/光 15+ 个实验全挤在一个文件，section 用 `data-go` 显隐 |
| `chemistry-lab.html` | 1526 行单文件 | 模型计算 + canvas 渲染 + 控件 + 文案全耦合在内联 JS |

核心痛点：**模型（物理/化学规律计算）与视图（canvas 渲染）、控件混在一起**。每加一个实验整文件膨胀，无法复用，难维护，也难给小布讲清结构。

## 二、PhET 关键设计思想（借鉴点）

1. 一个实验 = 一个独立 sim，从画廊（gallery）启动，互不干扰
2. Model–View 分离：纯数据模型按真实公式实时计算，视图只负责画
3. 连续可交互：滑块/拖拽 → 即时反馈，而非"点开始看动画"
4. sim 内分屏（screens）：如 `直观体验` / `测量实验` / `挑战题` 三个 Tab
5. 共享组件库：滑块、单选、play/pause/step、Reset All、测量工具，全站统一
6. 统一设计语言：配色、间距、字体一套 design tokens

## 三、架构方案（MVC + 模块化，保持零构建）

```
sim 单元（每个实验自包含）
├── model.js     纯逻辑：状态 + 按公式 step(dt) 更新，无 DOM
├── view.js      canvas 渲染：读 model 画图，无计算
├── controls.js  滑块/按钮 → 改 model
└── index.html   组装 + 引入共享库

shared/（全站复用）
├── design-tokens.css   配色 / 间距 / 字体
├── components.js       Slider / RadioGroup / PlayBar / DataTable / ResetButton
├── sim-frame.js        统一外壳：标题栏 + screens 切换 + 底部工具条
└── chart.js            数据作图（实验四步法里的"画图下结论"）
```

## 四、单个实验的标准模板（PhET 三屏）

每个实验统一成三个 screen，贴合笔记里的"四步法 / 五步法"：

- ① 体验屏：自由拖拽 / 调滑块，直观感受变量关系（如声波调频率 → 音调）
- ② 实验屏：控制变量法 + 数据表 + 自动作图 + 误差分析（对标中考实验题）
- ③ 挑战屏：内嵌真题 / 小题，做完即时判定

## 五、目录结构（迁移后）

```
xiaobu-ai-lab/
├── index.html              总画廊（物理 / 化学 / 数学分区）
├── shared/                 共享设计系统 + 组件
├── physics/
│   ├── sound-waves/        ← 拆出来的独立 sim
│   ├── reflection/
│   ├── ohm/  density/ ...
└── chemistry/
    ├── o2/  co2/  electrolysis/ ...
```

## 六、迁移路径（增量，不推倒重来）

1. 先抽 `shared/`：把现有内联样式里的配色 / 卡片 / 滑块抽成 design-tokens + 组件（一次性，收益最大）
2. 挑 1 个试点：用"声波"或"探究液体压强"做第一个 MVC 拆分样板
3. 照样板逐个迁：每次搬一个实验到独立目录，老文件保留直到搬完
4. 总画廊接管入口：`index.html` 改成读各 sim 的 manifest 自动生成卡片

## 七、技术选型建议

- 保持零构建：原生 ES6 模块 + Canvas，双击 / 本地 server 即可运行（符合教学场景）
- 不引框架：小布要能看懂源码，React/Vue 增加心智负担；用一个约 100 行的极简 `sim-frame` 自管 screen 切换即可
- 可选增强：动画密集的实验后续可引入轻量物理引擎，但初中实验用手写公式更可控、更贴合教材

## 八、参考

- [PhET 互动模拟（物理）](https://phet.colorado.edu/en/simulations/filter?subjects=physics&type=html)
- [PhET 声波 Sound Waves](https://phet.colorado.edu/sims/html/sound-waves/latest/sound-waves_all.html)

---

## 下一步（待确认）

先做 `shared/` 设计系统 + 用「声波」做一个 MVC 样板 sim，跑通后再逐个迁移。
