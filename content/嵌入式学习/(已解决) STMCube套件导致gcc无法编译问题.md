---
tags:
  - 编译工具链
  - GCC
  - STM32CubeMX
  - Windows
  - 故障排查
date: 2026-02-28
---

## 问题
装了STM32CubeMX之后VSCode里就用不了gcc了。

```shell
F:\Projects\c>gcc F:\Projects\c\2.c -o F:\Projects\c\2.exe
gcc: fatal error: cannot execute 'cc1 ': CreateProcess: No such file or directory 
compilation terminated.
```

使用 `ucrt` 工具链安装了 `gcc` , 在 `ucrt` 终端中可以正常编译输出。

直接运行 `cc1.exe` 报错显示: ![[嵌入式学习/assets/(已解决) STMCube套件导致gcc无法编译问题-1.png]]

询问AI得知这个函数位于 `libwinpthread-1.dll` 中

终端运行: 
```shell
C:\Users\Pluviophile>where libwinpthread-1.dll
C:\Program Files (x86)\STMicroelectronics\stlink_server\libwinpthread-1.dll
F:\Program Files (x86)\IDEs\STN32CubeCLT_1.20.0\st-arm-clang\bin\libwinpthread
-1.dll
F:\Program Files (x86)\IDEs\STN32CubeCLT_1.20.0\STN32CubeProgrammer\bin\libwinpthread-1.dll
F:\msys64\ucrt64\bin\libwinpthread-1.dll
F:\mi\tools\adb-fastboot\libwinpthread-1.dll
F:\OpenoCD\bin\libwinpthread-1.dll
```

可见最先调用的是STM32Cube套件的库, 因为这个bin在安装STM32Cube时被写进了系统变量的path中。

![[嵌入式学习/assets/(已解决) STMCube套件导致gcc无法编译问题-2.png]]

但是由于**ST使用的库函数过于老旧**, 这个旧版dll中没有 `clock_gettime64` 这个函数, 所以gcc在编译过程中调用cc1时就会报错。

## 解决方式

因为用户变量优先级低于系统变量, 且需要保证STM32Cube正常运行, 所以只能委屈一下gcc了。

把 `msys64/ucrt/bin` 中的全部dll文件复制到 `msys64/ucrt/lib/gcc/x86_64_mingw32/版本号` 下。这是因为程序在运行时会优先在本目录下查找所需的库文件, 找不到才去path中找, 所以把gcc自己的dll拿过来就可以了。

然后gcc就可以正常编译了。

## 笔记关联

- **后续阅读**：[[嵌入式学习/ArmCC与GCC的printf()|ArmCC与GCC的printf()]] — 编译环境恢复后，再区分不同 C 库的串口输出接口。
- **相关实践**：[[嵌入式学习/移植RT-Thread Nano踩坑日记|移植RT-Thread Nano踩坑日记]] — 同样涉及 CubeMX 与 GCC/CMake 工程适配，但这里记录的是宿主机 DLL 冲突。
