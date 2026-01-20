FreeRTOS是开源的**实时操作系统(Real Time Operation System, RTOS)**。

## 什么是RTOS

很多人看到操作系统这个字眼就下意识觉得这东西和Windows、Linux等系统一样, 是庞大复杂的东西, 从而望而生畏。但在嵌入式领域, RTOS是广泛应用的, 且上手门槛并不高。

可以简单理解为把裸机编程的单线程的中断/循环轮询驱动, 变为RTOS中的非阻塞与多线程工作, 这些活都交给RTOS内核干, 而我们要做的只是把几个任务创建好。在多外设等复杂系统中, RTOS可以说是必不可少。

>[!info] 在嵌入式网络编程中, 启用RTOS是`LwIP`中支持socket/netconn API的必需条件

## 开始

这里不讨论关于RTOS移植到新平台的问题, 只基于现有平台(STM32CubeMX、ESP-IDF)。

```c title="Core/Src/main.c"
int main(void)  
{  
  
  /* USER CODE BEGIN 1 */  
  
  /* USER CODE END 1 */  
  /* MCU Configuration--------------------------------------------------------*/  
  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */  
  HAL_Init();  
  
  /* USER CODE BEGIN Init */  
  
  /* USER CODE END Init */  
  /* Configure the system clock */  
  SystemClock_Config();  
  
  /* USER CODE BEGIN SysInit */  
  
  /* USER CODE END SysInit */  
  /* Initialize all configured peripherals */  
  MX_GPIO_Init();  
  MX_DMA_Init();  
  MX_ADC1_Init();  
  MX_I2C1_Init();  
  MX_HRTIM1_Init();  
  MX_SPI1_Init();  
  MX_ADC2_Init();  
  MX_ADC3_Init();  
  MX_ADC4_Init();  
  MX_USART3_UART_Init();  
  MX_TIM2_Init();  
  /* USER CODE BEGIN 2 */  
  
  /* USER CODE END 2 */  
  /* Init scheduler */  
  osKernelInitialize(); 
  /* Call init function for freertos objects (in cmsis_os2.c) */  
  MX_FREERTOS_Init();  
  /* Start scheduler */  
  osKernelStart();  
  
  /* We should never get here as control is now taken by the scheduler */  
  
  /* Infinite loop */  /* USER CODE BEGIN WHILE */  
  while(1)  
  {  
    /* USER CODE END WHILE */  
  
    /* USER CODE BEGIN 3 */  
  }  
  /* USER CODE END 3 */  
}
```

以上是STM32启用了FreeRTOS的初始化代码。我们只看最后三行关于RTOS初始化的代码。

第一行为初始化整个RTOS。第二行为创建一个任务(主任务, 也可以创建其他的任务), 但此时还没有开始运行。第三行为启动调度器, 整个系统开始运转。这个函数不会返回, 作为调度器的主进程一直运行, 所以后面注释写不会运行到`while(1)`处。

再看创建线程:

```c title="Core/Src/app_freertos.c"
osThreadId_t defaultTaskHandle;  

const osThreadAttr_t defaultTask_attributes = {  
  .name = "defaultTask",  
  .priority = (osPriority_t) osPriorityNormal,  
  .stack_size = 1024 * 4  
};

void StartDefaultTask(void *argument)  
{  
  /* USER CODE BEGIN StartDefaultTask */  
  /* Infinite loop */  
  app_main();  
  // while(1)  
  // {  
  //   vTaskDelay(100);  
  // }  
  vTaskDelete(NULL);  
  /* USER CODE END StartDefaultTask */  
}

void MX_FREERTOS_Init(void)
{  
    defaultTaskHandle = osThreadNew(StartDefaultTask, NULL, &defaultTask_attributes);  
}
```

函数内只有这一行, 即创建一个任务, 任务函数为`StartDefaultTask`。

>[!note]
>cmsis对FreeRTOS的API做了一层封装, 即osThreadNew等这些函数, 用于为包括FreeRTOS在内的多种RTOS(如*RT-Thread*、*embeddos*等)搭建一个统一的抽象层, 但这只适用于STM32平台, 如果你还没习惯使用这些API, 那么建议直接用FreeRTOS的原生api来操作。

这里在主任务中调用`app_main()`, 在其中写我们的业务代码。这也是ESP-IDF的风格, 它的整个程序入口就是`app_main()`, HAL层由系统配置, 只给出主任务的接口, 原生即FreeRTOS。

```c title="User/main/main.c"
void app_main(void)  
{  
    xTaskCreate(LED_task0, "LED", 128, NULL, 10, NULL);  
    //在这里进行业务代码。
}
```

以上就是STM32平台下FreeRTOS的初始化流程。对的非常简便, 我们不需要与操作系统交互, 只写业务代码即可

## RTOS 基本用法

1. 任务相关API
- 创建任务
```c
函数原型:
BaseType_t xTaskCreate( TaskFunction_t pxTaskCode,
                   const char * const pcName,
                   const configSTACK_DEPTH_TYPE usStackDepth,
                   void * const pvParameters,
                   UBaseType_t uxPriority,
                   TaskHandle_t * const pxCreatedTask)

```
- 
    - `pxTaskCode`:  任务函数, 签名必须为`void (*)(void *)` 即不返回值, 传入参数为`void*`的函数。这个`void*`用于接收创建任务时的初始参数(因为通用任务可能有多种用途, 所以可用传入参数决定)。
    - `pcName`: 任务名称, 用于标识
    - `pvParameters`: 传入参数的指针, 如果无传入参数填NULL
    - `usStackDepth`: 栈大小, 原生FreeRTOS中这个参数的单位是字(word), 即4字节, 因平台而异。
    - `uxPriority`: 优先级, ***优先级数字越小, 优先度越低。***
    - `pxCreatedTask`: 任务句柄**的指针**, 用于控制任务(删除、暂停等)

用法:

```c {14}
void taskToCreate(void* pvParameter)
{
    int var1;
    while(1)
    {
        //do something;
        vTaskDelay(10);
    }
}

void app_main()
{
    TaskHanle_t taskHandle;
    xTaskCreate(taskToCreate, "Name", 256, NULL, 10, &taskHandle);
}
```

- 删除任务

    >[!tip]
    >
    >FreeRTOS中任务函数不可以返回, 必须由`vTaskDelete`删除

```c {5,20}
void app_main()
{
    TaskHanle_t taskHandle;
    xTaskCreate(taskToCreate, "Name", 256, NULL, 10, &taskHandle);
    vTaskDelete(taskHandle); // 在其他线程中调用句柄删除
}

或者:

void taskToCreate(void* pvParameter)
{
    int var1;
    while(1)
    {
        //do something;
        vTaskDelay(10);
        break;
    }
    
    vTaskDelete(NULL); //在任务中调用, 传入空指针删除自身任务
}
```

- 暂停/恢复

```c
vTaskSuspend(taskHandle);
//传入需要暂停的任务的句柄
vTaskSuspend(NULL);
//暂停自身任务

vTaskResume(taskHandle);
//恢复任务运行 只能由其他任务调用(因为暂停了不能恢复自身)
```

## RTOS组件

多线程引入了问题: 线程间通信和同步、竞态等

### 线程间通信

1. 事件组(`EventGroup`)

    即一个32位整数, 每一位都代表一个标志位(Flag).
    适合传递多个状态的组合。
    
```c
//Example by Gemini
#include "FreeRTOS.h"
#include "event_groups.h"

// 1. 定义事件位 (Bitmask)
#define BIT_WIFI_CONNECTED    (1 << 0) // 第0位
#define BIT_SERVER_CONNECTED  (1 << 1) // 第1位
#define BIT_ALL_READY         (BIT_WIFI_CONNECTED | BIT_SERVER_CONNECTED)

// 定义事件组句柄
EventGroupHandle_t xSystemEvents;

// --- 任务 A：负责设置状态 (比如网络任务) ---
void TaskNetwork(void *pvParameters)
{
    // 模拟连接 WiFi
    vTaskDelay(pdMS_TO_TICKS(2000));
    printf("WiFi Connected!\r\n");
    xEventGroupSetBits(xSystemEvents, BIT_WIFI_CONNECTED);

    // 模拟连接服务器
    vTaskDelay(pdMS_TO_TICKS(1000));
    printf("Server Connected!\r\n");
    xEventGroupSetBits(xSystemEvents, BIT_SERVER_CONNECTED);
    
    vTaskDelete(NULL); // 任务完成使命，自杀
}

// --- 任务 B：等待所有条件满足 (主逻辑) ---
void TaskMainWork(void *pvParameters)
{
    EventBits_t uxBits;
    printf("Waiting for network...\r\n");

    // 等待事件
    // 参数1: 句柄
    // 参数2: 等待的位 (0x03)
    // 参数3: pdTRUE = 退出时清除这些位 (复位)
    // 参数4: pdTRUE = 等待“所有”位都变1 (AND逻辑); pdFALSE = 任意一位变1就醒 (OR逻辑)
    // 参数5: 超时时间
    uxBits = xEventGroupWaitBits(xSystemEvents, 
                                 BIT_ALL_READY, 
                                 pdTRUE, 
                                 pdTRUE, 
                                 portMAX_DELAY);

    if ((uxBits & BIT_ALL_READY) == BIT_ALL_READY)
    {
        printf("All systems GO! Starting main logic...\r\n");
        // 开始核心业务...
    }
}

// --- 初始化 ---
void Init_App(void)
{
    xSystemEvents = xEventGroupCreate();
    // 创建任务...
}
```

2. 消息队列(`Queue`)

    可存放指定个数的指定大小的数据。

    队列会将接收的数据复制一份保存, 所以如果数据量很大, 可以使用静态缓冲区, 传递缓冲区的指针。

    发送方在队列满、接收方在队列空时均可可阻塞等待。

```c
//Example by Gemini
#include "FreeRTOS.h" 
#include "task.h" 
#include "queue.h" 

// 1. 定义要传输的数据结构 
typedef struct {
    uint8_t sensor_id;
    float temperature;
    float humidity;
} SensorData_t;

// 定义队列句柄
QueueHandle_t xSensorQueue;

// --- 任务 A：发送者 (比如传感器读取) ---
void TaskSender(void *pvParameters)
{
    SensorData_t myData;
    myData.sensor_id = 1;
    while(1)
    { 
        // 模拟采集数据 
        myData.temperature = 25.5f;
        myData.humidity = 60.0f; 
        // 发送数据到队列
        // 参数: 句柄, 数据指针, 等待时间(如果队列满了)
        if (xQueueSend(xSensorQueue, &myData, pdMS_TO_TICKS(10)) == pdPASS)
        {
            printf("Data sent successfully\r\n");
        }
        else
        {
            printf("Queue is full!\r\n");
        }
        vTaskDelay(pdMS_TO_TICKS(1000)); 
    }
} 
// --- 任务 B：接收者 (比如屏幕显示) --- 
void TaskReceiver(void *pvParameters)
{
    SensorData_t receivedData;
    while(1)
    { 
    // 从队列接收数据 
    // 参数: 句柄, 接收缓存指针, 等待时间(如果队列空了) 
    // portMAX_DELAY 表示死等，直到有数据来 
    if (xQueueReceive(xSensorQueue, &receivedData, portMAX_DELAY) == pdPASS)
    {
        printf("ID: %d, Temp: %.1f, Humi: %.1f\r\n", receivedData.sensor_id, receivedData.temperature, receivedData.humidity);
        }
    }
}
// --- 初始化代码 (在 main 或 defaultTask 中) ---
void Init_App(void)
{ 
    // 创建队列：深度为 10，每个单元大小为 sizeof(SensorData_t)
    xSensorQueue = xQueueCreate(10, sizeof(SensorData_t));
    if (xSensorQueue != NULL)
    {
        xTaskCreate(TaskSender, "Sender", 1024, NULL, 1, NULL);
        xTaskCreate(TaskReceiver, "Receiver", 1024, NULL, 2, NULL);
    } 
}
```

3. 消息通知(`TaskNotify`)

    向任务自带的邮箱中发送一个32位的整数。它的内存占用小、速度也快。
    
    限制/特点: 一对一发送。适合传递整数命令且不需要缓存多条的情况。

