// data/classicEndgames.js
// 经典「江湖排局」残局库。
//
// 局面来源：东萍象棋棋谱仓库（dpxq.com）「江湖八大排局」收录的古谱原图，
// 由 DhtmlXQ 棋子坐标串解码为本项目 FEN，并已逐一通过 engine/PositionValidator
// 校验为合法局面（见提交说明）。均为红先。
//
// 说明：这些名局多以「弱子巧和强子」「双方缠斗成和」著称，难度极高，
// 在「残局/题库」模式中作为对阵 AI 的高级实战训练与打谱探索之用。
//
// schema：{ id, name, fen, side:'red', type:'classic', difficulty, hint, desc }

export const classicEndgames = [
  {
    id: 'classic-qixingjuhui',
    name: '七星聚会',
    fen: '4rk3/3P5/4bP3/9/9/8P/9/1p2p2C1/3p1p3/4K1RR1 w - - 0 1',
    side: 'red',
    type: 'classic',
    difficulty: 5,
    hint: '红先。重在车兵与卒的牵制配合，先以炮控肋、兵卒互缠，正招方能脱困。',
    desc: '江湖四大名局之首，号称「残局之王」。红黑各七子，陷阱四伏，正着可成和。',
  },
  {
    id: 'classic-qianlieduxing',
    name: '千里独行',
    fen: '4k4/9/3aP3b/p8/9/6n2/2P3p2/4R4/3p1p3/4K4 w - - 0 1',
    side: 'red',
    type: 'classic',
    difficulty: 5,
    hint: '红先。单车需善用停着、等着，平中防将露头，步步为营。',
    desc: '又名「单枪赵云」「策杖独行」。以单车周旋群卒，停着、等着是取势关键。',
  },
  {
    id: 'classic-qiuyinjianglong',
    name: '蚯蚓降龙',
    fen: '3ak4/4a4/4b4/9/2p5P/2r6/9/6p2/2R1p4/5K2R w - - 0 1',
    side: 'red',
    type: 'classic',
    difficulty: 5,
    hint: '红先。双车看似矫若游龙，却被小卒牵制；进兵抢攻须算清纠缠。',
    desc: '又名「尺蚓降龙」。以弱子逼和强子的典范——小卒牵住双车，苦战成和。',
  },
  {
    id: 'classic-yemacaotian',
    name: '野马操田',
    fen: '2bak4/4a4/4b4/9/6NRR/2B6/1rP1P4/3pB4/4p4/3K5 w - - 0 1',
    side: 'red',
    type: 'classic',
    difficulty: 5,
    hint: '红先。马如野马奔腾操演于田垄之间，需借车马兵协同步步逼近将门。',
    desc: '江湖四大名局之一。马、车、兵纵横操演，攻守变化繁复，引人入胜。',
  },
  {
    id: 'classic-huoshaolianying',
    name: '火烧连营',
    fen: '3k5/4R4/4b3C/9/1P4RCc/6B2/9/4p4/3pp2p1/5K3 w - - 0 1',
    side: 'red',
    type: 'classic',
    difficulty: 5,
    hint: '红先。车炮连环如连营之势，须防对方解杀还杀的反击火力。',
    desc: '又称「单兵连营」。车炮联攻气势如虹，然变化精微，稍有不慎即遭反噬。',
  },
];

export default classicEndgames;
