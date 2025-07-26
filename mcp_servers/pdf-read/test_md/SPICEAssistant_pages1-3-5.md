Preprint. This work has been submitted to IEEE for possible puplication.

## SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies


SIMON NAU [1,2], JAN KRUMMENAUER [1], and ANDRÉ ZIMMERMANN [2,3]

1 Cross-Domain Computing Solutions, Robert Bosch GmbH, Daimlerstraße 6, Leonberg 71229, Germany
2 University of Stuttgart, Institute for Micro Integration (IFM), Allmandring 9b, Stuttgart 70569, Germany
3 Hahn-Schickard, Allmandring 9b, Stuttgart 70569, Germany


Corresponding author: Simon Nau (Simon.Nau@de.bosch.com).


**ABSTRACT** State-of-the-art large language models (LLMs) show high performance across a wide range
of tasks in many domains of science. In the field of electronic design automation (EDA), it is yet to be
determined to what extent they are capable to understand, adapt, and dimension electronic circuits. This
paper focuses on the application of LLMs to switched-mode power supply (SMPS) design on printed circuit
boards (PCBs). Particular challenges for LLMs in this context include their limited ability to interpret results
from key simulation tools like SPICE and the multi-step design process. To address these challenges, we
suggest SPICEAssistant, a framework that provides a broad selection of tools to an LLM. The tools serve
as an interface to SPICE, allowing the LLM to interact flexibly with the simulator to estimate the impact
of its modifications to the circuit. To evaluate the performance of SPICEAssistant, we defined a benchmark
consisting of 256 questions testing the ability to adapt circuit netlists to fulfil different SMPS design tasks.
The benchmarking results show that simulation feedback effectively improves SMPS design capabilities of
LLMs. An increasing number of simulation iterations leads to enhanced performance. The SPICEAssistant
framework significantly outperforms the standalone LLM GPT-4o on the benchmark by approximately 38%.


**INDEX TERMS** Electronic design automation, Large language model, SPICE, Switched-mode power supply



**I. INTRODUCTION**
# L ARGE language models (LLMs) have achieved remark-able results in a broad field of applications. In the engi
neering domain, the use of LLMs in software development
is a well-known and highly successful area [1]. Extensive
research is being conducted to translate this success into the
field of electronic design automation (EDA). One key area is
the development of digital integrated circuits (ICs) through
hardware description language (HDL) code generation, particularly with Verilog [2]–[10]. As HDL development is
similar to standard coding, LLMs perform well on these tasks.
Yet, there are challenges, such as the limited availability of
public Verilog data for LLM training in comparison to more
prevalent languages like Python [11]. Recent research has
extended the application of LLMs in hardware design beyond
HDL code generation. Another focus area in EDA is the integration of LLMs with circuit simulators, for example SPICE
(Simulation Program with Integrated Circuit Emphasis) [12].
In SPICEPilot [13] and AnalogCoder [14] the Python library
PySpice is used to generate SPICE simulations to support
the LLM in the development of circuits. LADAC [15] focuses on analog circuit design and utilizes LLMs to generate



amplifier and ring oscillator circuits. AmpAgent [16] uses a
multi-agent LLM system for automated literature analysis,
mathematical reasoning, and device sizing, demonstrating
success in designing multi-stage amplifiers. LEDRO [17] and
WiseEDA [18] combine LLMs with optimization techniques,
such as Bayesian optimization or particle swarm optimization. LEDRO focuses on refining analog circuit sizing of 22
Op-Amp topologies, while WiseEDA concentrates on radio
frequency integrated circuits (RFICs), exemplified by a bandpass filter. Finally, PICBench [19] introduces a benchmark for
evaluating LLM performance in photonic integrated circuit
(PIC) design.


In contrast to previous research, this work focuses on
the application of LLMs for switched-mode power supply
(SMPS) on printed circuit board (PCB) designs. The SMPS
circuits are represented via SPICE netlists. This application
presents unique challenges distinct from those in other fields.
In this paper, we aim to address the following challenges
faced by state-of-the-art LLMs in designing and adapting
SPICE netlists of SMPS circuits:



112023 1


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



In the conducted benchmarking, SPICEAssistant outperforms standalone GPT-4o by approximately 38%. It does
not require any additional training and is fully automated,
meaning no human intervention is necessary. With SPICEAssistant, engineers can simply specify their requirements in
natural language, avoiding the time-intensive design process
exemplified in Figure 1. In the benchmark experiments we
show that the performance of SPICEAssistant increases over
the number of interactions between the LLM and the simu
lation tools by roughly a factor of five. We further discuss
the performance of SPICEAssistant across different question
categories and highlight current limitations.


To summarize, this paper makes the following key contributions:


_•_ We introduce SPICEAssistant, an LLM-based agent
equipped with multiple tools to interpret feedback from
the LTSpice circuit simulator and retrieve information
from datasheets using RAG. SPICEAssistant performs
38% better on the benchmark than the state-of-the-art

LLM, GPT-4o.

_•_ The construction of a benchmark consisting of 256 questions that test the ability of LLMs to adapt, dimension,
and understand the structure of SPICE circuit netlists.

As a basis, examples from the field of switched-mode
power supplies are used.


**II. BACKGROUND**


_A. SWITCHED-MODE POWER SUPPLY_


Switched-mode power supplies are widely used electronic
circuits, that convert power from direct current (DC) sources
or alternating current (AC) sources to DC loads with a high
efficiency, allowing flexible adjustment of the output voltage
level. The buck, boost, and buck-boost are the three basic
SMPS topologies commonly used. One of the simplest SMPS
circuits is the general buck converter, also known as stepdown converter [28]. It consists of a switch realized with a
transistor, a diode, an inductor and an output capacitor, see
Figure 4a. Further, it requires a controller with a feedback
loop from the output voltage to drive the transistor to switch
between on and off states. This produces a pulse train, which
is filtered by the _L_ / _C_ output filter to supply a DC output
voltage [28]. The value of the DC output voltage is mainly
controlled by the ratio of the transistor’s on and off times.
Modern buck converters consist of sophisticated ICs as controllers that enable different operating modes, very high efficiencies, spread spectrum operation to reduce noise, adjustable switching frequency and start-up time. Other advanced features are for example fault protection mechanisms
such as overvoltage protection, overcurrent protection or thermal shutdown as well as the extension of the topology to
multi-phase buck converters.



_B. LLMS AND TIME-SERIES INPUT_

Table 1 provides the results of a case study, in which we examine the ability of the LLM GPT-4o to interpret time-series
data. Specifically, GPT-4o is tasked with identifying the ripple peak-to-peak value from either a raw numeric vector or its
corresponding image representation. An answer is considered
correct when the LLM’s reading falls within a 10% tolerance
range of the ground-truth value.


**TABLE 1.** Case study: Investigating the ability of the state-of-the-art LLM
GPT-4o to handle time series data, examined through the task of reading
the ripple in time series provided as numeric vectors or images


|Test<br>Case|Correct<br>Answer|Vector<br>Length|GPT-4o<br>(Vector)|Col5|GPT-4o<br>(Image)|Col7|
|---|---|---|---|---|---|---|
|1<br>2<br>3<br>4<br>5|426 µV<br>673 µV<br>17 mV<br>14.5 mV<br>24.1 mV|1250<br>2040<br>1600<br>650<br>950|350 µV<br>605 µV<br>113 mV<br>83.4 mV<br>24.3 mV|~~✗~~<br>✓<br>✗<br>✗<br>✓|0.8 mV<br>1.1 mV<br>36 mV<br>40 mV<br>24 mV|~~✗~~<br>✗<br>✗<br>✗<br>✓|



The results in table 1 show, that it is not a reliable option to
provide the time series as numeric vectors or images directly
to the LLM for interpretation and further processing. While
GPT-4o was, for example, not able to extract the correct ripple
from the signal visualized in Figure 2a, it was correct for the
test case depicted in Figure 2b.


(a) Test case 1: Output voltage of buck converter with ripple


(b) Test case 5: Output voltage of buck converter with ripple


**FIGURE 2.** Example SPICE simulation signals from the case study


**III. METHODOLOGY**

_A. SPICEASSISTANT_

The architecture of SPICEAssistant is shown in Figure 3.
The LLM-based agent gets a reference circuit netlist as in

3












S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



a steady-state time interval, then extracts the fundamental frequency by identifying the highest peak in the

spectrum.

_•_ _get_settle_in_time()_
Calculates the mean value of the output voltage over a
time window in steady state and identifies the first time
the signal reaches 90% of the steady state value.


_B. BENCHMARKING_


We created a benchmark to evaluate the ability of LLM-based
systems to understand, modify and dimension circuit netlists.
The benchmark is based on SMPS example circuits, featuring
three circuit types with increasing levels of difficulty. The
simplest is an idealized general buck converter, illustrated
in Figure 4a. The medium level is a buck converter using
the LTC3419, a dual step-down regulator [30], as shown in
Figure 4b. The most complex example is the typical application circuit of the LTC7802, a 2-phase synchronous stepdown controller with advanced features like spread spectrum
operation or a programmable switching frequency, depicted



in Figure 4c.
Overall, the benchmark contains 256 test questions: 72 for the
general buck converter (easy), 72 for the LTC3419 (medium),
and 112 for the LTC7802 (hard).
We examine various design tasks that are typical for SMPS
circuits. The test questions in this evaluation can be divided
into two categories: 32 questions focus on topology adaption,
while the remaining 224 questions are targeted on parameter
tuning.
The following examples illustrate the types of questions included in the benchmark. For the parameter tuning category,
a simple benchmark question is: "Adjust the netlist, such that
the supply voltage corresponds to the value _x_ ". To address this
question, the agent should follow two basic steps:


(1) Identify the line in the netlist that specifies the supply
voltage
(2) Adjust the component value correctly


A question of medium difficulty is: "Adjust the netlist, such
that the output voltage of the circuit corresponds to the value
_x_ . If necessary, set the supply voltage to the maximum pos


(a) LTSpice circuit of general buck converter (easy) (b) Typical LTC3419 application circuit, from its datasheet [30] (medium)


(c) Typical LTC7802 application circuit, from its datasheet [31] (hard)


**FIGURE 4.** The three SMPS circuit types, with increasing difficulty level, serve as a basis for the benchmark



5


