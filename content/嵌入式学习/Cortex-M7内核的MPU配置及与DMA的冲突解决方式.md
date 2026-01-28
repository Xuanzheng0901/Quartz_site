---
date: 2025-12-24
tags: 
    - 笔记
    - STM32
    - DMA
    - LwIP
---


适用于ARM Cortex-M7内核(STM32H7、F7等系列)

ARM在高端的Cortex-M7上新增了一些内存保护的功能(RAMECC、MPU(Memory Protect Unit)等), 导致我在使用这个高级平台时碰壁好多次 , 简单记录一下我踩的坑和解决方式。

## 1. 现象

移植LwIP时已将phy层适配好, 接入网络时发现无法获取DHCP地址(其实是无法正常收发数据)。在ETH的Rx、Tx中断中打断点发现无法进入。

## 2. 第一个问题

### 2.1 问题描述
引脚连接正常、LwIP层正常、phy芯片时钟正常、能正常执行到ETH_Tx等代码。
但是执行后就没反应了。发现是ETH中为Rx、Tx设置了描述符内存地址和Rx缓冲区地址, 但是 #链接脚本 中并没有为这些数组分配内存地址, 启动后将这几个数组的地址打印出来, 果然是0x20000xxx, 没有被放在0x30000000处。

>[!danger]
>由于ARMCC编译器(即Keil自带的编译器)没有ld脚本而是直接在代码中指定地址, 所以不存在这个问题
>所以这个问题只在 #CMake 工具链中存在, 并且需要手动解决(在 #链接脚本 中为内存指定地址)。而CubeMX没有为这个平台生成特定的代码, 必须批评一下。


```c title="LWIP/Target/ethernetif.c"
#if defined ( __ICCARM__ ) /*!< IAR Compiler */  
  
#pragma location=0x30000000  
ETH_DMADescTypeDef  DMARxDscrTab[ETH_RX_DESC_CNT]; /* Ethernet Rx DMA Descriptors */  
#pragma location=0x30000080  
ETH_DMADescTypeDef  DMATxDscrTab[ETH_TX_DESC_CNT]; /* Ethernet Tx DMA Descriptors */  
  
#elif defined ( __CC_ARM )  /* MDK ARM Compiler */  
  
__attribute__((at(0x30000000))) ETH_DMADescTypeDef  DMARxDscrTab[ETH_RX_DESC_CNT]; /* Ethernet Rx DMA Descriptors */  
__attribute__((at(0x30000080))) ETH_DMADescTypeDef  DMATxDscrTab[ETH_TX_DESC_CNT]; /* Ethernet Tx DMA Descriptors */  
  
#elif defined ( __GNUC__ ) /* GNU Compiler */  
  
ETH_DMADescTypeDef DMARxDscrTab[ETH_RX_DESC_CNT] __attribute__((section(".RxDecripSection"))); /* Ethernet Rx DMA Descriptors */  
ETH_DMADescTypeDef DMATxDscrTab[ETH_TX_DESC_CNT] __attribute__((section(".TxDecripSection")));   /* Ethernet Tx DMA Descriptors */  
  
#endif  
  
#if defined ( __ICCARM__ ) /*!< IAR Compiler */  
#pragma location = 0x30000100  
extern u8_t memp_memory_RX_POOL_base[];  
  
#elif defined ( __CC_ARM ) /* MDK ARM Compiler */  
__attribute__((section(".Rx_PoolSection"))) extern u8_t memp_memory_RX_POOL_base[];  
  
#elif defined ( __GNUC__ ) /* GNU */  
__attribute__((section(".Rx_PoolSection"))) extern u8_t memp_memory_RX_POOL_base[];  
#endif
```

![[嵌入式学习/assets/Cortex-M7内核的MPU配置及与DMA的冲突解决方式-5.png]]


### 2.2 解决方式: 修改链接脚本
打开链接脚本, 在SECTIONS块中添加如下代码: 
```c title="STM32H7XX_FLASH.ld"
/* 以太网接收描述符 */  
.RxDecripSection 0x30000000 (NOLOAD) :  
{  
  KEEP(*(.RxDecripSection))  
} >RAM_D2  
  
/* 以太网发送描述符 */  
.TxDecripSection 0x30000080 (NOLOAD) :  
{  
  KEEP(*(.TxDecripSection))  
} >RAM_D2  
  
/* 以太网接收缓冲池 (LwIP Zero-Copy) */  
.Rx_PoolSection 0x30000100 (NOLOAD) :  
{  
  KEEP(*(.Rx_PoolSection))  
} >RAM_D2
```

>[!info] 
>关于链接脚本(.ld文件)的语法等, 详见: [GNU ld linker script 介绍](https://github.com/iDalink/ld-linker-script)
>>[!note]这里涉及到比较深层的编译器知识, **不必深入了解**, 并且由于不同具体情况下所需的链接脚本代码也大相径庭, *所以只需在需要时将你的链接脚本和代码丢给AI并清楚描述需求即可*。

重新加载CMake并编译即可将数据放到内存对应位置
## 3. 第二个问题
### 3.1 问题
按照如上方法更改之后, 发现依然不正常, 报错如下: 
```
DHCP Success! IP: 0.0.Got Sem, Reading...  
psr: 0xa1000000  
r00: 0x20007a98  
r01: 0x20007a9c  
r02: 0xe000ed00  
r03: 0xfffffff8  
r04: 0xdeadbeef  
r05: 0xdeadbeef  
r06: 0xdeadbeef  
r07: 0x20006008  
r08: 0xdeadbeef  
r09: 0xdeadbeef  
r10: 0xdeadbeef  
r11: 0xdeadbeef  
r12: 0x00000000  
lr: 0x08001249  
pc: 0x0801a480  
hard fault on thread: eth_rx
```
这里询问AI, 考虑到了使用DMA发送、接收, 而STM32的MPU默认启用时, 会阻止CPU在非特权态访问DMA的Buffer(0x30000000), 一旦访问就会触发HardFault。


### 3.2 解决方法: 更改权限
为了不丢失缓存带来的性能提升, 为DMA的buffer单开一个MPU Region
1. 更改权限为可读写
2. 开启Shareable, 关闭Cacheable和Bufferable
3. 将TEX field level设为1
![[嵌入式学习/assets/Cortex-M7内核的MPU配置及与DMA的冲突解决方式-6.png]]

这样即可。