---
tags:
  - C语言
  - 编译工具链
  - GCC
  - 串口
  - 日志
  - 操作系统
date: 2026-09-08
---

突然发现忘记写这个了

使用Keil开发时, 如果想通过printf将数据打印到串口, 需要使用以下代码: 

```c
int fputc(int ch, FILE *f)
{
    /* 发送一个字节数据到 USART1，超时时间设置为 0xFFFF */ 
    HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, 0xFFFF);
    return ch;
}
```

即重写`fputc`

如果转到基于CMake与GCC的工程时会发现以上代码不起作用, 调用printf时数据不会通过USART1发出来。

原因是Keil使用的ArmCC编译器与GCC编译器使用的C标准库不同。

| 编译器        | ARMCC                               | GCC                                                              |
| ---------- | ----------------------------------- | ---------------------------------------------------------------- |
| C标准库       | MicroLib(ARM专门为嵌入式设备适配)             | NewLib(通用底层)                                                     |
| printf内容流向 | `printf() -> vfprintf() -> fputc()` | `printf() -> vfprintf() -> _write() (syscall) -> __io_putchar()` |

可以看到NewLib的数据流向中没有fputc出现, 所以重写fputc对重定向printf没有作用。

由于在MicroLib下数据只能走fputc, 所以这里不展开讲。重点讲一下NewLib下的重写方案

1. 和MicroLib下相同, 只是将重写的函数从fputc()改为__io_putchar()

```c
int __io_putchar(int ch)
{
    /* 发送一个字节数据到 USART1，超时时间设置为 0xFFFF */ 
    HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, 0xFFFF);
    return ch;
}
```

好处是修改点相同, 可以直接将MicroLib下的代码搬过来, 便于快速移植。

但多字节传输时会频繁从syscall进入HAL, 需要多次执行包括**获取HAL互斥锁、检查USART状态机、等待单字节传输完成**等等一系列流程, 耗时更多、性能较差, 并且如果使用多线程或多任务还可能导致传输错位

> 例如线程A发送"Hello", 中途被中断打断执行线程B, 线程B发送"world", 最终发送效果可能是"Helworldlo"或者其他被打乱的数据

而且单字节传输**无法使用DMA**

> 因为单字节启动DMA的配置开销比直接阻塞发还大

所以在NewLib中, 更推荐的做法是直接重写_write()

```c
int _write(int file, char *ptr, int len)
{
    // 直接一次性将整段缓冲区通过串口发送
    HAL_UART_Transmit(&huart1, (uint8_t *)ptr, len, 0xFFFF);
    return len; 
}
```

此时可以在入口处加入互斥锁等IPC保证传输的原子性, 更进一步, 可使用DMA+中断回调释放信号量来实现异步传输。

## 笔记关联

- **相关基础**：[[嵌入式学习/FreeRTOS笔记|FreeRTOS笔记]] — 理解多任务访问串口时的互斥锁、信号量和任务同步。
- **延伸实践**：[[嵌入式学习/(FreeRTOS向)日志库与内存池|(FreeRTOS向)日志库与内存池]] — 从串口重定向进一步实现格式化、队列传递与 DMA 异步日志。
- **移植对照**：[[嵌入式学习/移植RT-Thread Nano踩坑日记|移植RT-Thread Nano踩坑日记]] — 对照 rt_kprintf 的控制台适配与标准库 printf 的接入。
