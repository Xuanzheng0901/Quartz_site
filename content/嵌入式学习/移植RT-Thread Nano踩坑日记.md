---
date : 2025-12-09
---
起因是接手了一个基于RT-Thread(为了简便, 下文称rtt) Studio 这个IDE开发的~~屎山项目~~, 尝试开发了几天, 实在是受不了rtt多此一举的硬件层抽象和反人类的外设添加步骤, 于是尝试将其移植到易于配置的CubeMX, 用更现代的CMake+CLion进行开发。
# CubeMX的配置项

> 本文基于 #STM32CubeMX 6.15.0、 #RT-Thread  nano 4.1.1
	
## 1. 在组件管理器中安装并启用rtt
![[嵌入式学习/assets/移植RT-Thread Nano踩坑日记-5.png]]勾选kernel和libcpu, shell也要选, 否则无法使用 `rt_krprinf` 打印日志
>  我一开始没有勾shell,编译会报错, 看了报错代码, 是找不到 `finsh.h` , 但我想, 没有勾选shell怎么会启用finsh呢? 然后我勾选了shell就能编译通过了, 才发现多了一个配置是否启用shell的选项, 而这个选项对应的宏 `RT_USING_FINSH` 是默认启用的, 也就是说想要禁用这个终端就必须先启用shell, 才能将其禁用。
## 2. 配置rtt 
 ![[嵌入式学习/assets/移植RT-Thread Nano踩坑日记-6.png]]
    - 把 `Using Rtt components initialazition` 和 `Using user main` 启用, 使用rtt的初始化逻辑。这里有个[伏笔](#伏笔回收)。
	- `Debug` 和 `Hook` 选项按需启用
	- 内存管理这里据说RTT有一套自己的内存管理算法, 可以启用。
## 3. 配置NVIC
![[嵌入式学习/assets/移植RT-Thread Nano踩坑日记-7.png]]
 在 `Code Generation` 中将 `Hard Fault interrupt` 、`Pendable ...` 、`Time Base...` 这三个中断函数取消勾选, 因为rtt会定义它们,不需要CubeMX生成。
## 4. 配置SYS
> [!warning]
> 将系统的时钟源保持为`SysTick`, 在生成代码时如果报警告, 直接忽视即可。使用 `SysTick`之外的定时器源会导致rtt的时钟出问题, Tick速度变快一倍。不清楚是什么原因导致的。~~其实是我懒得查。~~
## 5. 配置USART1
默认配置即可。rtt打印日志默认使用USART1, 不启用会导致编译不通过。

## 6. 参考
以上的配置参考了 [这篇博客](https://www.cnblogs.com/shuijiaoa/p/15762650.html)和[这篇博客](https://club.rt-thread.org/ask/article/09235f1f8fe6c19e.html)

--------- 
# 代码修改
## 问题
配置完CubeMX原以为万事大吉了, 编译、烧录都没问题, 但是运行的时候报错却来了: 
``` 
psr: 0x01000000  
r00: 0x00000014  
r01: 0xef9dc845  
r02: 0x645c4ec8  
r03: 0xa20a53ab  
r04: 0x20000344  
r05: 0x00000000  
r06: 0x00000000  
r07: 0x2001ff88  
r08: 0x00000000  
r09: 0x00000000  
r10: 0x00000000  
r11: 0x00000000  
r12: 0x00000000  
lr: 0x08005685  
pc: 0x080053c6  
hard fault on handler

bus fault:  
SCB_CFSR_BFSR:0x04 IMPRECISERR  
usage fault:  
SCB_CFSR_UFSR:0x100 UNALIGNED
```

排查调用栈结构, 用反汇编找到`rt_schedule_remove_thread()` -> `rt_list_remove()` 这样的调用结构, 于是和 #Gemini 理论一小时这是哪里的内存被写坏了, 尝试修改了内存偏移、调大main线程的栈空间、开关一些选项等等,,,但依旧没用。

调试发现`rt_schedule_remove_thread()` 是main函数调用delay时触发的, 调用时进入睡眠状态, 随后调度器将睡眠中的线程移出运行列表。一切看起来都没有问题。于是我去排查链表节点的来源,初始化、修改的位置。
并且我在`main()`处打了断点, 发现它的调用上层只有`ResetHandler()`。
     
发现一点: 
    - **我的调度器没有启动!!!**
### 伏笔回收
因为关闭了components initialization和user main(实际上开启了也会崩溃), rtt的核心完全没有初始化, 我的main函数在裸机状态下调用了rt_thread_delay进行延迟, 触发了调度器的调度, 但是调度器根本没有初始化, 一个用于获取当前线程句柄的函数返回了一个未初始化的值, 导致访问非法的内存, 一进入主程序就会崩溃进入HardFault。

以上参考的两篇博客的工具链都不是 #CMake, 入口函数可能由框架接管了,而使用CMake需要自行配置入口。

我找了半天rtt程序的入口, 结果都找不到。
> 这里不得不吐槽一下, rtt的代码结构实在是太烂了。文件目录完全无法体现代码的调用层次, 而且不开components initialization根本没有入口函数, 必须要自己把初始化代码写进业务代码中。且一个初始化、打印日志的实现函数在多个文件中定义, 无法得知哪个会被实际调用。

## 解决方法
最终打开了components initialization和user main后才有了这样的预编译: 

```c title="Middlewares/RealThread_RTOS_RT-Thread/bsp/_template/cubemx_config/board.c"
#ifdef __ARMCC_VERSION  
extern int $Super$$main(void);  
/* re-define main function */  
int $Sub$$main(void)  
{  
    rtthread_startup();
    return 0;  
}  
#elif defined(__ICCARM__)  
extern int main(void);  
/* __low_level_init will auto called by IAR cstartup */  
extern void __iar_data_init3(void);  
int __low_level_init(void)  
{  
    // call IAR table copy function.  
    __iar_data_init3();  
    rtthread_startup();   
    return 0;  
}  
#elif defined(__GNUC__)  
/* Add -eentry to arm-none-eabi-gcc argument */  
int entry(void)  
{  
    rtthread_startup();  
    return 0;  
}  
#endif
```

这个`entry()`看起来非常像整个程序的规定入口, 于是我找到程序入口的位置:
```asm title="startup_stm32h743xx.s"
/* Call the application's entry point.*/  
  bl  main  
  bx  lr  
.size  Reset_Handler, .-Reset_Handler
```
把`main`改为`entry`, 编译运行。这次调试不再进HardFault了, 但是日志没输出。

# 移植适配
##  串口
查找rt_kprintf()的定义: 
```c title="Middlewares/RealThread_RTOS_RT-Thread/src/kservice.c"
RT_WEAK int rt_kprintf(const char *fmt, ...)  
{  
    va_list args;  
    rt_size_t length;  
    static char rt_log_buf[RT_CONSOLEBUF_SIZE];  
    va_start(args, fmt);  
    length = rt_vsnprintf(rt_log_buf, sizeof(rt_log_buf) - 1, fmt, args);  
    if (length > RT_CONSOLEBUF_SIZE - 1)  
        length = RT_CONSOLEBUF_SIZE - 1;  
#ifdef RT_USING_DEVICE  
    //该部分未启用
#else  
    rt_hw_console_output(rt_log_buf);  
#endif /* RT_USING_DEVICE */  
    va_end(args);  
    return length;  
}  
RTM_EXPORT(rt_kprintf);  
```
可以看到最终调用了一个`rt_hw_console_output()`来将缓冲区发送出来。但是查找定义发现这个函数用了`WEAK`关键字, 是个空函数。真正的定义在`board.c`里: 

```c 
//kservice.c: 
RT_WEAK void rt_hw_console_output(const char *str)  
{  
    /* empty console output */  
}

//board.c: 
void rt_hw_console_output(const char *str)  
{  
    rt_size_t i = 0, size = 0;  
    char a = '\r';  
    __HAL_UNLOCK(&UartHandle);  
    size = rt_strlen(str);  
    for (i = 0; i < size; i++)  
    {  
        if (*(str + i) == '\n')  
        {  
            HAL_UART_Transmit(&UartHandle, (uint8_t *)&a, 1, 1);  
        }  
        HAL_UART_Transmit(&UartHandle, (uint8_t *)(str + i), 1, 1);  
    }  
}
```

但是`board.c`中的实现因为使用的`USART`句柄错误且没有给可编辑区域(每次使用MX生成代码后都会被覆盖), 所以无法使用。只能覆盖声明了`WEAK`的`rt_kprintf()` : 

```c title="Core/src/main.c"
int rt_kprintf(const char *fmt, ...)  
{  
    va_list args;  
    static char rt_log_buf[RT_CONSOLEBUF_SIZE];  
    va_start(args, fmt);  
    rt_size_t length = rt_vsnprintf(rt_log_buf, sizeof(rt_log_buf) - 1, fmt, args);  
    if (length > RT_CONSOLEBUF_SIZE - 1)  
        length = RT_CONSOLEBUF_SIZE - 1;  
    char a = '\r';  
    __HAL_UNLOCK(&huart1);  

    for (rt_size_t i = 0; i < rt_strlen(rt_log_buf); i++)  
    {  
        if (*(rt_log_buf + i) == '\n')  
        {  
            HAL_UART_Transmit(&huart1, (uint8_t *)&a, 1, 1);  
        }  
        HAL_UART_Transmit(&huart1, (uint8_t *)(rt_log_buf + i), 1, 1);  
    }  
    va_end(args);
    return length;  
}
```

~~再次编译烧录, 这次可以正常显示了。~~

2025.12.16 编辑: 
到这里还不可以正常显示, 因为关于usart的初始化代码在板级初始化中, 但是`board.c`中关于串口的初始化代码是错误的, 而cubemx又没有给可编辑区域, 导致无法修改, 故在内核时期USART没有被初始化, 从而无法打印内核日志。用`INIT_BOARD_EXPORT`声明正确的usart初始化函数也没有用(根本不会被调用)。

解决方法: 使用**懒加载**

直接将rt_kprintf声明如下: 

```c title="Core/src/main.c"
int rt_kprintf(const char *fmt, ...)
{
  static int usart_is_init = 0;
  if (!usart_is_init)
  {  
    MX_USART1_UART_Init();  //在第一次使用时进行初始化
    usart_is_init = 1;
  }
  
  va_list args;
  va_start(args, fmt);
  int length = vprintf(fmt, args);
  //对接标准库的printf, 也可以直接用上面那一套, 加入懒加载逻辑即可
  va_end(args);
  return length;
}
```

![[嵌入式学习/assets/移植RT-Thread Nano踩坑日记-8.png]]

>[!success]
> 至此移植完成, 可以在CMake平台使用rtt核心且使用HAL库的原生API了。