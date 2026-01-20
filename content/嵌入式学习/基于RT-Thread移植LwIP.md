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