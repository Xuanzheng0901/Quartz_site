---
tags:
  - RT-Thread
  - RTOS
  - STM32
  - LwIP
  - 网络
  - 以太网
  - DMA
date: 2026-01-21
---

## 1. 物理(phy)层
- 使用`LAN8720`以太网协议芯片。可直接使用cubemx中LwIP提供的LAN8742的驱动。这两个芯片pin2pin兼容, 软件驱动完全兼容, 仅仅是LAN8742多了几个无关紧要的功能。

>[!info]
>根据[IEEE802.3](https://www.ieee802.org/3)标准, 所有phy芯片的0-15寄存器理论都通用
>
>参见: [博客园: 【驱动】以太网扫盲（二）phy寄存器简介](https://www.cnblogs.com/dongxb/p/17365055.html)


关于以太网的驱动层的移植可见[[嵌入式学习/Cortex-M7内核的MPU配置及与DMA的冲突解决方式|Cortex-M7内核的MPU配置及与DMA的冲突解决方式]]

<div style="
    width: 400px;
    min-height: 32px;
    border: 1px solid #333;
    padding: 6px 8px;
    font-family: Consolas, monospace;
    font-size: 16px;
    box-sizing: border-box;
  ">
    <span id="text"></span><span id="cursor">|</span>
</div>


<script src="1.js"></script>

## 笔记关联

- **前置阅读**：[[嵌入式学习/移植RT-Thread Nano踩坑日记|移植RT-Thread Nano踩坑日记]] — 先完成 RTOS 的启动、调度器初始化与串口适配。
- **相关主题**：[[杂七杂八的笔记/代理运行时序|代理运行时序]] — 从设备侧的以太网驱动延伸到应用侧的连接与代理转发；两篇关注的网络层次不同。
