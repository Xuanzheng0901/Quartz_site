---
date: 2026-01-04
tags:
  - C语言
  - 预处理
  - 编译工具链
---


>[!warning] 警告
>本文中包括但不限于以下要素: 宏魔法、宏定义地狱、CONFUSING_NAMING、递归调用、栈溢出<br/>
>请未成年人在家长陪同下观看。

预处理指令是C语言学习中很容易被忽略的一部分, 相当多的人只知道`#define` `#include`这些常见的指令, 而忽视了其他有用的预处理指令, 更是有人把预处理简单地当做宏定义。

## 预处理
> [!faq]+ 预处理是什么?
>> [!quote]  C语言标准规定，预处理是指前4个编译阶段（phases of translation）。
>> 1. [三字符组与双字符组](https://zh.wikipedia.org/wiki/%E4%B8%89%E5%AD%97%E7%AC%A6%E7%BB%84%E4%B8%8E%E5%8F%8C%E5%AD%97%E7%AC%A6%E7%BB%84 "三字符组与双字符组")的替换
>> 2. 行拼接（Line splicing）: 把物理源码行（Physical source line）中的换行符[转义字符](https://zh.wikipedia.org/wiki/%E8%BD%AC%E4%B9%89%E5%AD%97%E7%AC%A6 "转义字符")处理为普通的换行符，从而把源程序处理为逻辑行的顺序集合。
>> 3. 单词化（Tokenization）: 处理每行的空白、注释等，使每行成为token的顺序集。
>> 4. 扩展巨集与预处理指令（directive）处理。

> 顾名思义, 在编译期之前进行处理。代码上一般来讲就是 `#include` `#define` 这种以`#`开头的指令, 通常后面会跟着一些全大写命名的宏。

下面是一些比较常见的预处理用法。

## `#include "FILENAME"`

这是我们的老朋友。想必每个人的第一行c代码都是`#include <stdio.h>`。

在处理时, 预处理器会从include路径中寻找名为`FILENAME`的文件, 然后将其以**文本**形式复制到当前文件中。

### 1.`"FILENAME"` 与 `<FILENAME>` 

原则上来讲, 引用标准库头文件必须用尖括号, 而用户定义头文件用引号, 而现代编译器比较智能, 用引号引用标准库也能找得到。

所以一般引号包裹基本可以取代尖括号包裹。

### 2.递归调用

如果include的文件中也有#include指令, 则预处理器会进行线性、深度优先地进行处理

例: 

```c title="a.h"
#include "b.h"
int a;
```

```c title="b.h"
#include "c.h"
int b;
```

```c title="c.h"
int c;
```

则展开后等价为: 

```c
int c;
int b;
int a;
```

### 3.include guard

在上面的例子中, 如果将`b.h`中的内容改为: 

```c title="b.h"
#include "a.h"
int b;
```

且不加任何保护, 那么

```
In file included from xxx/a.h:1
                 from xxx/b.h:1
                 from xxx/a.h:1
                 from xxx/b.h:1
                 ...
                 from xxx/a.h:1
                 from xxx/b.h:1: error: #include nested depth 200 exceeds maximum of 200 (use -fmax-include-depth=DEPTH to increase the maximum)
```

预处理器直接爆红。因为它会进行递归展开, 如果a包含了b, b又包含了a, 那么就会进入死循环。
这时我们就需要include guard了。你肯定见过在头文件中这样的代码: 

```c
#ifndef __A_H
#define __A_H

...

#endif
```

或者这样的:

```c
#pragma once
...

```

这些代码都有一个作用: 防止头文件被重复调用导致循环问题。其中前者通过一个宏(即标志位)来保证**在这个文件中只有第一次使用时有效**, 这由[宏定义的特性](#4.作用域)决定, 后者则是告诉编译器**此物理文件在本次编译中只被展开一次**来实现保护。

## `#define`

`#define PI 3.14f`<br/>
这是宏定义

```c 
#define ASSERT(expr)                                             \
    do {                                                         \
        if (!(expr)) {                                           \
            fprintf(stderr,                                      \
                "ASSERT failed: %s\n"                            \
                "  file: %s\n"                                   \
                "  line: %d\n",                                  \
                #expr, __FILE__, __LINE__);                      \
            abort();                                             \
        }                                                        \
    } while (0)
//一个简单的带日志的断言
```

这也是宏定义

### 1.宏定义的展开

从宏名开始，到这一行结束(或反斜杠续行), 中间的所有字符，原样替换。

`#define A B C D E` 在代码中使用 `A`时, 它会被替换为 `B C D E`, 

反斜杠续行: 预处理器对于宏结束的标志为换行, 在换行前打一个反斜杠告诉预处理器这个宏还没完, 继续接上下一行的代码, 而这整个宏会被视为一段连续的文本。

例: 

```c
#define DO_SOMETHING(x)     \
    printf("x = %d\n", x);  \
    x++;                    \
    printf("done\n")
```

展开后为: 

```c
printf("x = %d\n", x);x++;printf("done\n")
```

### 2.单行限制 

上面的宏定义并不是一个好定义。因为它并不是单语句。在以下的场景中会出问题: 

```c
if(a)
    DO_SOMETHING(a);
else
    DO_SOMETHING(0);
```

发现了吗? 对于省略大括号的`if`等条件控制语句, 它们后面只能接一条语句, 而这时使用这样的宏便会引入多条语句, 导致报错。

解决方法也很简单: 将其包围起来, 使其变为一条语句即可。一般使用`do{...}while(0)` : 

```c
#define DO_SOMETHING(x)        \
    do{                        \
        printf("x = %d\n", x); \
        x++;                   \
        printf("done\n")       \
    } while(0)
```

### 3.优先级

看这个宏定义

```c
#define SQUARE(A) A * A
```

看起来好像没什么问题。而当调用`SQUARE(1+1)`时, 问题就来了。这个宏展开为: 

```c
1+1 * 1+1
```
**根据算数优先级, 返回值是3, 而不是预期的4。**

所以宏定义时必须要给每个参数整个宏加上括号, 防止出现优先级错误。

```c
#define SQUARE(A) ((A) * (A))

int x = SQUARE(1+1);

//展开为: int x = ((1+1) * (1+1)) = 4 
```

### 4.作用域

宏定义作用域以**编译单元**为单位。

编译单元即一个文件和它其中递归展开的所有#include文件。如果没有#include, 可以默认作用域为单文件。

### 5.宏魔法

这部分是宏的灵魂, 也是用框架时我吐槽最多的宏地狱大门。

1. `#` 操作符

可以把参数原样变成字符串

例: 

```c
#define STR(x) #x

int a = 100;

printf("%s = %d", STR(a), a); //输出: a = 100

```

> 这是编译型、强、静态类型语言对字符串处理的抗争

2. `##`操作符

拼接标识符, 可用于生成伪泛型代码

例: 

```c
#define TYPE_ADD_FUNC(type) \ 
type type##_add(type a, type b) { return (type)(a + b); } 

TYPE_ADD_FUNC(int) // 生成 int int_add(int a, int b)... 
TYPE_ADD_FUNC(float) // 生成 float float_add(float a, float b)...

```

3. 变参宏(`__VA_ARGS__`)
可用于像printf一样接受可变长的参数

```
#define LOG(fmt, ...) printf("[LOG] " fmt "\n", ##__VA_ARGS__)
```

其中`##__VA_ARGS__`前面的##用于在无可变参数时删掉前面尾随的逗号。(c99引入特性)

4. 预定义宏
```c
__FILE__ //当前文件名
__LINE__ //当前行号
__DATE__ __TIME__ //编译时的日期和时间
__func__ //当前函数名
```

## 条件编译 

就是if/else 

只不过是在编译期确定分支执行。常用于Kconfig和多平台适配等

```c
#if defined ( __ICCARM__ ) /*!< IAR Compiler */  
#pragma location = 0x30000100  
extern u8_t memp_memory_RX_POOL_base[];  
  
#elif defined ( __CC_ARM ) /* MDK ARM Compiler */  
__attribute__((section(".Rx_PoolSection"))) extern u8_t memp_memory_RX_POOL_base[];  
  
#elif defined ( __GNUC__ ) /* GNU */  
__attribute__((section(".Rx_PoolSection"))) extern u8_t memp_memory_RX_POOL_base[];  
#endif
```
最后需要用`#endif`收尾。

## 笔记关联

- **应用实例**：[[嵌入式学习/(FreeRTOS向)日志库与内存池|(FreeRTOS向)日志库与内存池]] — 日志等级、变参宏和 do-while 宏封装的实际用法。
- **应用实例**：[[嵌入式学习/移植RT-Thread Nano踩坑日记|移植RT-Thread Nano踩坑日记]] — 通过条件编译选择编译器对应的启动入口。
- **相关主题**：[[杂七杂八的笔记/Go语言|Go语言]] — 对照 C 的编译单元与 Go 的包、目录、文件构建入口。
