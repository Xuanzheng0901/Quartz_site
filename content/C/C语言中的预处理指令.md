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

### 1. `"FILENAME"` 与 `<FILENAME>` 

若文件名以尖括号包裹, 则预处理器只会在内部目录寻找该文件。以引号包裹则除了内部目录, 还会寻找其他指定目录(例如工程目录)。

所以一般引号包裹基本可以取代尖括号包裹。

### 2. 递归调用

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

### 3. include guard

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

这些代码都有一个作用: 防止头文件被重复调用导致循环问题。其中前者通过一个宏(即标志位)来保证**在这个文件中只有第一次使用时有效**, 这由[宏定义的特性](#宏定义)决定, 后者则是告诉编译器**此物理文件在本次编译中只被展开一次**来实现保护。

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

### 1. 宏定义的展开

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

### 2. 单行限制 

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

未完待续。
