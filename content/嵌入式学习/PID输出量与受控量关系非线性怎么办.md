---
date: 2026-03-17
---

最近在做PID控制buck-boost四开关同步升降压

大概原理图如下

![[嵌入式学习/assets/PID输出量与受控量关系非线性怎么办-1.png]]

`PWMA`与`PWMB`互补, 即`Q1`和`Q4`同相, `Q2`和`Q3`与`Q1`和`Q4`互补

`Vout`与`Vin`的关系与`PWMA`的占空比`D`的关系由下式确定:

$$
V_{out} = V_{in}\frac{D}{1-D}
$$

在输入Vin稳定的情况下, Vout与D显然是个非线性的关系

![[嵌入式学习/assets/PID输出量与受控量关系非线性怎么办-2.png]]

常规的做法是通过PID去控制占空比D从而控制电压, 但是在这里由于离散PID的公式:

$$
u(k) = K_p \left[ e(k) + \frac{T}{T_i} \sum_{i=0}^k e(i) + \frac{T_d}{T} \left( e(k) - e(k-1) \right) \right] + u_0 \tag{位置式}
$$

$$
\Delta u(k) = K_p \left[ e(k) - e(k-1) \right] + \frac{K_p T}{T_i} e(k) + \frac{K_p T_d}{T} \left[ e(k) - 2e(k-1) + e(k-2) \right] \tag{增量式}
$$

可以看到输出u与误差e基本是线性的, 所以不能直接用于控制这里非线性的D, 会导致高占空比时微调很小的占空比值就会导致电压出现很大波动。

解决方式: 直接控制受控量(即电压)。

```c
static uint32_t voltage_to_duty(float expect_mV)  
{  
    if(expect_mV < 10.0f)  
        return 0;  
  
    float denominator = expect_mV + INPUT_VOLTAGE_MV;  
  
    if(denominator < 100.0f)  
        denominator = 100.0f;  
  
    float duty_cycle = expect_mV / denominator;  
  
    // 硬件保护  
    if(duty_cycle > MAX_DUTY_RATIO)  
        duty_cycle = MAX_DUTY_RATIO;  
  
    return (uint32_t)(duty_cycle * PWM_PERIOD_ARR);  
}  
  
void pwm_set_duty(uint32_t pwm_duty)  
{  
    __HAL_HRTIM_SETCOMPARE(&hhrtim1, HRTIM_TIMERINDEX_TIMER_E, HRTIM_COMPAREUNIT_3, (pwm_duty >> 1) + 1);  
    hhrtim1.Instance->sTimerxRegs[TIMER_E].CMP1CxR = pwm_duty;  
}
static void PID_ctrl_routine(void *pvParameters)  
{  
    static uint32_t target_voltage_mV = 0;  
    static uint32_t target_voltage_buffer_mV = 0;  
  
    static float next_output_voltage_mV = 0.0f;  
  
    static uint32_t *buf_ptr;  
  
    static float temp_current_voltage_mV = 0.0f;  
    static float last_voltage_mV = 0.0f;  
    static float last_last_voltage_mV = 0.0f;  
    while(1)  
    {  
        //1. 等待ADC数据  
        if(xQueueReceive(adc_queue, &buf_ptr, portMAX_DELAY) == pdTRUE)  
        {  
            //2. 查询target是否改变  
            if(pdPASS == xQueueReceive(pid_ctrl_queue_mV, &target_voltage_buffer_mV, 0))  
            {  
                if(target_voltage_mV != target_voltage_buffer_mV)  
                {  
                    target_voltage_mV = target_voltage_buffer_mV;  
                    // pid_reset_ctrl_block(pid_handle); //使用增量式pid更改target后不能重置  
                }  
            }  
  
            //3. 计算实际电压/电流
            for(uint8_t i = 0; i < ADC_BUFFER_LENGTH / 2; i++)  
            {  
                origin_voltage_sum += buf_ptr[i] & 0x0FFF;  
                origin_current_sum += buf_ptr[i] >> 16;  
            }  
            // 读取到的电压  20分压  
            temp_current_voltage_mV = origin_voltage_sum / 4095.0f * 3300.0f * 20.0f / (float)(ADC_BUFFER_LENGTH / 2)  
                                      * 1.0048f;  
            if(temp_current_voltage_mV >= 10.0f)  
                temp_current_voltage_mV += 60.0f;  
            if(temp_current_voltage_mV < 0)  
                temp_current_voltage_mV = 0;  
  
            now_current_A = origin_current_sum / 4095.0f * 3300.0f * 2.0f / 1000.0f / (  
                                ADC_BUFFER_LENGTH / 2); //单位A  
  
            //4. 对均值进行二阶rc滤波            
            temp_current_voltage_mV = RC_ALPHA_DENO_1 * temp_current_voltage_mV + RC_ALPHA_DENO_2 * last_voltage_mV +  
                                      RC_ALPHA_DENO_3 * last_last_voltage_mV;  
            now_voltage_mV = temp_current_voltage_mV;  
            last_last_voltage_mV = last_voltage_mV;  
            last_voltage_mV = temp_current_voltage_mV;  
  
  
            //4. 进行pid计算  
            float error_mV = (float)target_voltage_mV - temp_current_voltage_mV;  
  
            pid_compute(pid_handle, error_mV, &next_output_voltage_mV);  
            uint32_t output_duty = voltage_to_duty(next_output_voltage_mV);  
            pwm_set_duty(output_duty);  
        }  
    }  
}
```

直接使PID控制"目标电压", 然后进行一次转换转为占空比, 从而将控制线性化。

该找时间学学自控原理了。。。