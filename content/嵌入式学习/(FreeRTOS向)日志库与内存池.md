---
tags:
  - FreeRTOS
  - 任务通信
  - 内存管理
  - 日志
  - 串口
  - DMA
date: 2026-09-09
---

在嵌入式设备运行代码时总是会遇到些奇怪的问题、需要监测程序运行流程阶段, 便需要打印日志

使用传统的`printf("作为日志打印功能不够")`

于是借鉴了[ESP-IDF的日志库](https://github.com/espressif/esp-idf/blob/master/components/log/)

精简了一份基于宏的构造日志的轻量库

<details> 
<summary> LOG.c </summary>

```c title="LOG.c"
#include "LOG.h"  
#include <stdio.h>  
#include <string.h>  
#include <stdarg.h>  
#include "FreeRTOS.h"  
#include "queue.h"  
#include "semphr.h"  
#include "task.h"  
#include "usart.h"  
  
#define ANSI_RESET  "\033[0m"  
#define ANSI_COLOR  "\033[0;%sm"  
  
#define LOG_MEM_POOL_SIZE   16  
  
static log_level_t s_log_level = LOG_VERBOSE;  
  
static xQueueHandle log_queue = NULL;   //业务代码发送日志的接口  
static xQueueHandle log_mem_pool_queue = NULL;  //存放内存池指针的队列  
static xSemaphoreHandle log_uart_sem = NULL;   //USART/DMA信号量  
static TaskHandle_t log_task_handle = NULL;  
  
static log_data_t log_mem_pool[LOG_MEM_POOL_SIZE];  
  
static uint32_t get_time_ms(void)  
{  
    return xTaskGetTickCount();  
}  
  
static void log_get_level_info(log_level_t level, char *level_char, const char **color)  
{  
    switch(level)  
    {  
        case LOG_ERROR:  
            *level_char = 'E';  
            *color = "31";  
            break;  
        case LOG_WARN:  
            *level_char = 'W';  
            *color = "33";  
            break;  
        case LOG_INFO:  
            *level_char = 'I';  
            *color = "32";  
            break;  
        case LOG_DEBUG:  
            *level_char = 'D';  
            *color = "39";  
            break;  
        default:  
            *level_char = 'V';  
            *color = "90";  
            break;  
    }  
}  
  
static int log_format_message(char *raw, const char *color, char level_char, uint32_t ts, const char *tag,  
                              const char *format, va_list args)  
{  
    int offset = 0;  
    static const char reset_str[] = "\033[0m\n";  
    static const int reserve_len = sizeof(reset_str) - 1; // 编译期计算，替代代价较高的 strlen  
    static const int max_len_for_text = LOG_RAW_MAX_LEN - reserve_len - 1;  
  
    int n = snprintf(raw + offset, max_len_for_text - offset,  
                     "\033[0;%sm%c (%lu) %s: ",  
                     color, level_char, ts, tag); //拼接颜色转义代码、日志等级、时间、tag  
    if(n < 0)  
        n = 0;  
    if(n >= max_len_for_text - offset)  
        n = max_len_for_text - offset;  
    offset += n;  
  
    if(offset < max_len_for_text)  
    {  
        n = vsnprintf(raw + offset, max_len_for_text - offset, format, args); //打印格式化字符串到缓冲区  
        if(n < 0)  
            n = 0;  
        if(n >= max_len_for_text - offset)  
            n = max_len_for_text - offset;  //防止截断导致无法转回正常颜色  
        offset += n;  
    }  
  
    memcpy(raw + offset, reset_str, reserve_len + 1);  
    offset += reserve_len;  
  
    return offset;  
}  
  
void log_set_level(log_level_t level)  
{  
    s_log_level = level;  
}  
  
void log_write(log_level_t level, const char *tag, const char *format, ...)  
{  
    if(level > s_log_level || log_queue == NULL)  
        return;  
  
    const char *color;  
    char level_char;  
    log_get_level_info(level, &level_char, &color);  
  
    log_data_t *log_buffer = NULL;  
  
    if(xQueueReceive(log_mem_pool_queue, &log_buffer, 0) != pdTRUE)  
        return;  
  
    uint32_t ts = get_time_ms();  
    va_list args;  
    va_start(args, format);  
    log_buffer->len = log_format_message(log_buffer->data, color, level_char, ts, tag, format, args);  
    va_end(args);  
  
    if(xQueueSend(log_queue, &log_buffer, 0) != pdTRUE)  
    {  
        xQueueSend(log_mem_pool_queue, &log_buffer, 0);  
    }  
}  
  
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart)  
{  
    static BaseType_t xHigherPriorityTaskWoken = pdFALSE;  
    if(huart == &huart3)  
    {  
        vTaskNotifyGiveFromISR(log_task_handle, &xHigherPriorityTaskWoken);  //中断中通知发送任务  
    }  
}  
  
void log_send_task(void *args)  
{  
    log_data_t *recv_buf_ptr = NULL;  
    while(1)  
    {  
        if(xQueueReceive(log_queue, &recv_buf_ptr, portMAX_DELAY) == pdTRUE)  //等待日志  
        {  
            if(HAL_UART_Transmit_DMA(&huart3, (const uint8_t *)recv_buf_ptr->data, recv_buf_ptr->len) != HAL_OK)  
            {  
                // 如果失败，手动释放内存并继续循环，否则会死锁  
                xQueueSend(log_mem_pool_queue, &recv_buf_ptr, 0);  
                continue;  
            }  
            ulTaskNotifyTake(pdTRUE, portMAX_DELAY); //等待DMA传输完成  
            xQueueSend(log_mem_pool_queue, &recv_buf_ptr, 0);  //完成后释放内存块  
        }  
    }  
}  
  
void log_init(log_level_t level)  
{  
    log_set_level(level);  
    log_mem_pool_queue = xQueueCreate(LOG_MEM_POOL_SIZE, sizeof(log_data_t*));  
    for(uint8_t i = 0; i < LOG_MEM_POOL_SIZE; i++)  
    {  
        log_data_t *ptr = &log_mem_pool[i];  
        xQueueSend(log_mem_pool_queue, &ptr, portMAX_DELAY); //将内存池指针放入队列  
    }  
  
    log_queue = xQueueCreate(LOG_MEM_POOL_SIZE, sizeof(log_data_t*));  
    log_uart_sem = xSemaphoreCreateBinary();  
    xSemaphoreGive(log_uart_sem);  
  
    xTaskCreate(log_send_task, "log_send_task", 256, NULL, 12, &log_task_handle);  
  
    LOGI("LOG", "日志服务已启动");  
}
```

</details>

<details> 
<summary> LOG.h </summary>

```c title="LOG.h"
#ifndef LOG_H  
#define LOG_H  
#include <stdint.h>  
  
#define LOG_RAW_MAX_LEN 253  
  
typedef enum {  
    LOG_NONE, /* 不输出 */  
    LOG_ERROR, /* 错误 (Red) */  
    LOG_WARN, /* 警告 (Yellow) */  
    LOG_INFO, /* 信息 (Green) */  
    LOG_DEBUG, /* 调试 (Default/White) */  
    LOG_VERBOSE /* 详细 (Gray) */  
} log_level_t;  
  
typedef struct {  
    uint16_t len;  
    char data[LOG_RAW_MAX_LEN + 1];  
} log_data_t;  
  
void log_init(log_level_t level);  
  
void log_set_level(log_level_t level);  
  
void log_write(log_level_t level, const char *tag, const char *format, ...);  
  
#define LOG_COLOR_E "31"  /* Red */  
#define LOG_COLOR_W "33"  /* Yellow */  
#define LOG_COLOR_I "32"  /* Green */  
#define LOG_COLOR_D "39"  /* Default */  
#define LOG_COLOR_V "90"  /* Gray */  
  
/*  
 *  设置编译时的日志过滤级别。  
 */#ifndef LOG_LOCAL_LEVEL  
#define LOG_LOCAL_LEVEL LOG_VERBOSE  
#endif  
  
#define LOG_FORMAT(letter, format)  LOG_COLOR_ ## letter, format  
  
#define LOGE(tag, format, ...) do { if (LOG_LOCAL_LEVEL >= LOG_ERROR) log_write(LOG_ERROR, tag, format, ##__VA_ARGS__); } while(0)  
#define LOGW(tag, format, ...) do { if (LOG_LOCAL_LEVEL >= LOG_WARN)  log_write(LOG_WARN,  tag, format, ##__VA_ARGS__); } while(0)  
#define LOGI(tag, format, ...) do { if (LOG_LOCAL_LEVEL >= LOG_INFO)  log_write(LOG_INFO,  tag, format, ##__VA_ARGS__); } while(0)  
#define LOGD(tag, format, ...) do { if (LOG_LOCAL_LEVEL >= LOG_DEBUG) log_write(LOG_DEBUG, tag, format, ##__VA_ARGS__); } while(0)  
#define LOGV(tag, format, ...) do { if (LOG_LOCAL_LEVEL >= LOG_VERBOSE) log_write(LOG_VERBOSE, tag, format, ##__VA_ARGS__); } while(0)  
  
  
#endif //G474_1_LOG_H
```

</details>


实现队列送入、异步发送日志
通过宏调用 `log_write()` -> 在 `log_write()` 中格式化字符串 -> 构造完成后将其传入队列
`log_send_task()` 等待队列数据, 进行发送

然而第一个版本在rt-thread上面实现, rt-thread的message queue支持传输不定长的数据, 发送日志只需将buffer传递给任务进行格式化即可

而FreeRTOS的队列初始化时就指定了数据长度, 传入数据时拷贝定长内存, 这就要求我们使用一个数据结构来存放日志数据。

```c
typedef struct {  
    uint16_t len;  
    char data[LOG_RAW_MAX_LEN + 1];  
} log_data_t;  
```

显然, 如果使用队列来直接传输日志数据, 进行一次日志传输对应一次几百字节的内存拷贝带来的性能开销是无法接受的, 所以必须使用队列传输指针。

如果使用栈内存, 无法确保其生命周期覆盖异步发送的全过程, 在将指针推入队列后, 格式化函数一旦退栈, 其栈帧随即被销毁, 对应的内存区域可能被其他函数使用, 从而引发野指针问题, 发送任务将发送无效数据。

如果每次使用 `malloc` 进行动态分配, 同样会带来性能开销, 以及内存碎片, 或者内存泄漏问题。

于是便需要使用内存池。

核心思路: 日志系统初始化时预分配多块日志数据结构大小的内存, 将对应指针存入一个队列中, 将其存满, 在需要内存时通过 `xQueueReceive` 来获取可用内存区域的首地址, 直接在这个地址进行日志构造

发送任务完成发送后将内存指针重新放入队列中, 代表其再次可用。此时日志结构中的 `len` 可保证发送的数据一定与构造的字符串数据匹配, 不会越界或截断。

## 笔记关联

- **前置阅读**：[[C/C语言中的预处理指令|C语言中的预处理指令]] — 理解 LOG 宏中的条件编译、变参宏与 do-while 封装。
- **前置阅读**：[[嵌入式学习/FreeRTOS笔记|FreeRTOS笔记]] — 理解队列传指针、任务通知和任务间同步。
- **相关基础**：[[嵌入式学习/ArmCC与GCC的printf()|ArmCC与GCC的printf()]] — 对照直接串口重定向与本篇先格式化、再交给发送任务的路径。
- **平台延伸**：[[嵌入式学习/Cortex-M7内核的MPU配置及与DMA的冲突解决方式|Cortex-M7内核的MPU配置及与DMA的冲突解决方式]] — 把 DMA 日志搬到 Cortex-M7 时，还需关注缓冲区所在内存与访问属性。
