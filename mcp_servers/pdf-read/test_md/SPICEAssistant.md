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




_•_ **Limitations in simulation result interpretability:**
While simulation tools like SPICE are essential in the

development process of SMPS circuits, state-of-the-art
LLMs have limited ability to interpret the simulation
results [15]. We investigate this in a case study in Section
II-B for SPICE simulation outputs, demonstrating that
GPT-4o cannot reliably extract information from the
resulting time series signals.

_•_ **Lack of circuit specific domain knowledge:**
SMPS circuits typically contain larger ICs, such as integrated controllers, along with peripheral circuitry. For
such specific power controllers however, publicly available data suitable for LLM training are scarce. In many
instances, the datasheet may be the only public source of
information for a specific IC.
Furthermore, since datasheets contain multimodal information, their readability for LLMs is relatively poor. For
example, a schematic of the typical application circuit is
an important part of most power controller datasheets.
But state-of-the-art LLMs, like GPT-4o, are not able
to read such circuit schematic images, as [16], [20],

[21] and [22] have demonstrated. Furthermore, most
datasheets include many graphical plots, which models
like GPT-4o also struggle to interpret, see Section II-B.

_•_ **Complex multi-step design process:**
The SMPS design process presents significant challenges. Even a simple task, such as adjusting the peripheral circuit netlist of an LTC3419 controller to achieve

a current ripple of 100 mA, requires a sophisticated
reasoning process. Figure 1 visualizes how that question
would be solved by an engineer. All the steps of the
reasoning process and the required information sources datasheet, circuit netlist and LTSpice simulation, are displayed to give an insight in the sophisticated reasoning
process the LLM has to mimic.

_•_ **LLM outputs lack reliability:**
LLMs sometimes provide unreliable answers [23]. Their
tendency to hallucinate is a major challenge for employing LLMs [24]. This issue is especially problematic
for our application on SMPS design, as hallucinations
are more likely to occur when the LLM lacks relevant
domain specific knowledge [25] [26] and when they deal
with complex reasoning tasks [26].

To mitigate these challenges, we suggest SPICEAssistant.
At its core lies an LLM, in this case GPT-4o [1], for which we
have developed a broad selection of tools. The tools consist
of functions, that serve as an interface for the LLM to the
LTSpice simulator. These functions reliably extract different
features from the simulated signals and provide them in a
readable form as feedback to the LLM. One example would
be getting a reliable peak-to-peak value of the output voltage
ripple. Additionally, in order to enhance the LLM’s circuitspecific domain knowledge, it is enabled to interact with the
corresponding datasheet via Retrieval Augmented Generation


1 Accessed via Azure OpenAI REST API, version 024-05-01-preview.


2



Human Expert



Information
















|Use background knowledge, look in datasheet of used<br>LTC3419 step-down regulator to find out, that current<br>ripple is mainly controlled by the inductor 𝐿|Col2|Source|
|---|---|---|
|Use background knowledge, look in datasheet of used<br>LTC3419 step-down regulator to find out, that current<br>ripple is mainly controlled by the inductor𝐿|Use background knowledge, look in datasheet of used<br>LTC3419 step-down regulator to find out, that current<br>ripple is mainly controlled by the inductor𝐿||
||Read formula for current ripple: Δ𝐼𝐿=<br>𝑉out<br>𝐿⋅𝑓s (1 −<br>𝑉out<br>𝑉in )|Read formula for current ripple: Δ𝐼𝐿=<br>𝑉out<br>𝐿⋅𝑓s (1 −<br>𝑉out<br>𝑉in )|
|Rearrange formula|Rearrange formula|Rearrange formula|
|Find missing parameters for formula:𝑓s, 𝑉in, 𝑉out|Find missing parameters for formula:𝑓s, 𝑉in, 𝑉out|Find missing parameters for formula:𝑓s, 𝑉in, 𝑉out|










|Col1|Col2|Col3|VCRXLRC..13lUT32te o1C rnIOa 3NOadNUdN40Un T1010T 02 09419 O4 m40U 0N. TI 0211N 500 94µ00 21N 220 p0002<br>K|
|---|---|---|---|
|||Read𝑉in from given netlist: 5.5V|`R3 N004`<br>`C2 OUT1`<br>`.tran 9`<br>`.end`|
|||Read 𝑓s from datasheet: 2.25 MHz||
|||||
|Read formula for𝑉out = 0.6V(1 +<br>𝑅2<br>𝑅1) from datasheet|Read formula for𝑉out = 0.6V(1 +<br>𝑅2<br>𝑅1) from datasheet|Read formula for𝑉out = 0.6V(1 +<br>𝑅2<br>𝑅1) from datasheet|Read formula for𝑉out = 0.6V(1 +<br>𝑅2<br>𝑅1) from datasheet|
|Read formula for𝑉out = 0.6V(1 +<br>𝑅2<br>𝑅1) from datasheet|Read𝑅2, 𝑅1from given netlist (they may be<br>named differently): 187kΩ, 59kΩ|Read𝑅2, 𝑅1from given netlist (they may be<br>named differently): 187kΩ, 59kΩ|`V1 IN 0 4.2`<br>`C3 OUT2 0 10µ`<br>`Rload1 OUT1 0 1200`<br>`XU1 N004 IN 0 N002`<br>`LTC3419`<br>`R3 N004 0 59K`<br>`C2 OUT1 N004 22p`<br>`.tran 9m`<br>`.end`|





Run LTSpice simulation to verify result and
if necessary, readapt manually


**FIGURE 1.** **The approach of an engineer to solve the example question**
**"Adjust the netlist, such that the current ripple has the value 100 mA".**
**See complete input prompt in Figure 5. The meaning of the used**
**variables is:** Δ _I_ _L_ **- ripple current,** _f_ _s_ **- switching frequency,** _V_ **out** **- output**
**voltage,** _V_ **in** **- input voltage,** _R_ 1 **and** _R_ 2 **- resistors in feedback path**


(RAG) [27].
Thereby, we enable the LLM to flexibly interact with the
LTSpice simulation and the datasheet. Thus, we can combine
the LLM’s background knowledge and basic reasoning capabilities with insights into the complex physical functionality
of the circuits. The LLM can go through multiple iterations
with the simulator and thus learn what the effect of changes
in the circuit is. As a result, it has a much higher ability to
mimic the complex SMPS design process, than in a standard
straightforward workflow. Finally, the simulation feedback
effectively verifies the LLM responses, which increases their
reliability significantly.


We created a benchmark to evaluate the performance of
our suggested framework. The benchmark consists of 256
questions, each requiring the LLM to adapt a circuit netlist
to fulfill a certain design task. For the benchmark, example
circuits of varying complexity levels from the area of SMPS
are used as the basis.

In most cases, the datasheet of a power controller contains an
image of the typical application circuit. Usually, the engineer
starts with that basic circuitry and then adapts it until it
fulfills the desired requirements. Taking this workflow as an
example, we aim to _adapt_ existing SPICE netlists instead of
creating SMPS schematics from scratch. In related literature,
complex real-world circuits are often not generated from
scratch; rather, a topology library is used as a starting point

[14], [18], or the schematic image is manually translated into
a netlist for the LLM [16].


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



put, derived from the typical application circuit found in the
datasheets of SMPS chips. In most cases these initial circuits
do not meet the desired specifications. Therefore, the task of
the agent is to modify the netlist to align with specific input
requirements given by an engineer.
In the setup shown in Figure 3, the standalone LLM GPT-4o
serves as baseline agent, depicted in grey, which directly outputs a modified netlist. To optimize its performance, we employ prompt engineering, providing tailored instructions. For
instance, we advise the agent to always include the adapted
netlist in its responses. Additionally, the phrase "Think step
by step." is incorporated, since it has been shown in [29] that
this can improve GPT’s performance.
The first extension of this baseline is depicted in orange.
GPT-4o is provided with specific information about the
SMPS used, sourced from the corresponding datasheet via
RAG. The LLM assistant’s instructions are adjusted accordingly to inform it, that it has access to the datasheet. The LLM
decides autonomously how often it retrieves information from
the datasheet.

The blue colored part in Figure 3 highlights a second extension to the baseline LLM agent. The LLM can receive sim


ulation feedback about the behavior of the circuit, allowing
it to estimate the impact of its modifications to the netlist.
This feedback helps to verify the netlist adaptions suggested
by the LLM, enhancing the reliability of the responses. The
interaction between the LLM and LTSpice simulation is enabled by a set of reading tools (python functions) that serve as
interface. In Section II-B, we pointed out, that GPT-4o can not
reliably extract features, like a ripple, from the output signal
of the LTSpice simulation. To address this, we developed a
comprehensive set of preimplemented tools to extract various features from the LTSpice output signals. The LLM can
access these tools and flexibly decide which tool to use and
how often to call upon it, based on the specific benchmark
question. Some of these tools are for example:


_•_ _get_mean_output_voltage()_
Calculates the mean over a time interval in the steady
state of the output voltage.

_•_ _get_ripple()_
Extracts the peak-to-peak value of a periodic signal in
the steady state, as discussed in Section II-B.

_•_ _get_switching_frequency()_
First, it performs a Fourier transform of the signal within












|Col1|Col2|Col3|
|---|---|---|
||||
|`V`<br>`C`<br>`R`<br>`X`<br>`I`<br>`L`<br>`R`<br>`R`<br>`C`<br>`.`<br>`.`|`1 IN 0 4`<br>`3 OUT2 0`<br>`load1 OU`<br>`U1 N004`<br>`N N001 I`<br>`TC3419`<br>`2 OUT1 N`<br>`3 N004 0`<br>`2 OUT1 N`<br>`tran 9m`<br>`end`|`.2`<br>` 10µ`<br>`T1 0 1200`<br>`IN 0 N002`<br>`N N003 0`<br>`004 59K`<br>` 59K`<br>`004 22p`|

























SPICE Interaction Datasheet Interaction Baseline Pipeline


**FIGURE 3.** Overview of the SPICEAssistant framework: An instructed GPT-4o agent serves as baseline, receiving a reference circuit and requirements as
input and directly outputs the adapted circuit netlist. The first extension enables information retrieval from datasheets using RAG. The second extension
equips the agent with several tools through which it can receive simulation feedback about specific circuit features


4


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


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



sible value". To solve this design task for a LTC3419 circuit,
the agent should follow a series of steps:

(1) Read the output voltage formula _V_ out = 0 _._ 6 _V_ (1 + _R_ _[R]_ 1 [2] [)]

from the datasheet or draw it from the LLM’s internal

knowledge.
(2) Rearrange the formula to calculate _R_ 1 and/or _R_ 2, to meet
the required output voltage _x_ .
(3) Identify _R_ 1, _R_ 2 in the netlist and change their component
values. They are the two resistors forming a voltage
divider in the feedback path of the controller and may
be named differently than _R_ 1 and _R_ 2 .
(4) If the required output voltage is greater than or equal
to the supply voltage, then read the maximum allowed
input voltage for the controller from the datasheet and
adjust it as in the first example question above.

More difficult design tasks involve a stepwise evaluation
of multiple formulas and the values of multiple components
may need to be changed.
An example from the topology adaption question category for
a LTC7802 example circuit is: "Adjust the netlist to select
the pulse skipping mode". To accomplish this task, the agent
should follow these steps:


(1) Read from the datasheet that pulse skipping mode is
selected by tying the mode pin to INTVcc (another pin)
through a 100k resistor.
(2) Identify the responsible mode pin and the INTVcc pin in
the netlist.

(3) Connect the mode pin via a 100k resistor to INTVcc.



changes in the test circuits. Moreover, combining the design
tasks with different dimensioning values, such as setting the
ripple current to various target values, multiplies the number
of benchmark questions. A complete example benchmark
question prompt, using a medium-difficulty LTC3419 netlist,
as input for the SPICEAssistant, is shown in Figure 5.
The benchmarking is automated using a json file, see Figure
6. This file contains the necessary information to construct
each test question prompt and to evaluate the LLM-generated
netlists. It includes the target dimensioning value, allowed
tolerance, and the specific verification tool to be used. These
verification tools are identical to those used by the LLM agent
to obtain feedback from the LTSpice simulation.


For all benchmark questions









SPICE Netlist


of Example


Circuit


Design Task


Dimensioning


value


Tolerance





**FIGURE 5.** **Complete benchmark question input prompt**


The 256 benchmark questions were created by integrating
various design tasks, as illustrated in the examples above,
across the three circuit types. Further diversity is achieved
by varying component values and applying minor topology


6



**FIGURE 6.** **The automatic benchmarking involves simulating**
**SPICEAssistant’s output netlist, extracting the relevant design feature**
**with a reading tool, and evaluating it against the target dimensioning**
**value.**


**IV. RESULTS AND DISCUSSION**

_A. EXPERIMENTAL SETUP_

In the following experiments, GPT-4o is used as state-of-theart LLM configured with a temperature = 1 and top-p = 1. It
is accessed via the Azure OpenAI REST API [32] (version
2024-05-01-preview) by employing their assistant API. For
the RAG process, the default parameters provided by the
AzureOpenai API [33] are taken. That means, the RAG is
configured with a chunk size of 800 tokens and a chunk
overlap of 400 tokens, utilizes the text-embedding-3-large
model [34] with 256 dimensions for vector embedding. The
maximum number of chunks added as context to the LLM

is 20. Circuit simulations are performed using the freely
available SPICE simulator LTSpice [35]. All reported API
call results were generated between March and April 2025.


_B. EVALUATION METRICS_

As evaluation metric the solve rate is employed, which represents the percentage of design tasks from the benchmark that
are correctly completed by the SPICEAssistant. A question
is considered to be correctly answered if the target value
falls within a specified tolerance range, such as a ripple of
18 mV _±_ 0.9 mV. Generally, the tolerance is set at 5%, except
for topology adaption questions, like "Adjust the netlist to
select the pulse skipping mode.", which can only be answered
right or wrong.
The solve rate categorizes each response from the SPICE

S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies


**TABLE 2.** Main benchmarking results: The performance is shown for design tasks related to the three different circuit types and the total benchmark,
using the Solve Rate and median( _APE_ ) as performance metrics. The methods assessed include the baseline GPT-4o agent, combinations with datasheet
information retrieval via RAG, feedback from SPICE simulations, and the complete SPICEAssistant framework using both


|Col1|General Buck Converter (easy)|Col3|LTC3419 (medium)|Col5|LTC7802 (hard)|Col7|Total|Col9|
|---|---|---|---|---|---|---|---|---|
|Method|Solve Rate|median(_APE_)|Solve Rate|median(_APE_)|Solve Rate|median(_APE_)|Solve Rate|median(_APE_)|
|Baseline: GPT-4o<br>GPT-4o + RAG<br>GPT-4o + SPICE<br>SPICEAssistant|29.0_ ±_ 1.0<br>25.4_ ±_ 1.1<br>64.4_ ±_ 1.5<br>**64.9**_ ±_** 1.8**|55.3_ ±_ 3.1<br>63.2_ ±_ 2.7<br>3.7_ ±_ 0.2<br>**3.6**_ ±_** 0.3**|12.5<br>18.1<br>48.6<br>**50.0**|56.3<br>55.0<br>4.7<br>**4.6**|7.1<br>10.7<br>39.3<br>**47.3**|75.2<br>55.0<br>5.4<br>**4.3**|14.8<br>16.9<br>49.0<br>**53.0**|64.3<br>57.3<br>4.7<br>**4.2**|



Assistant as either correct or incorrect. As supplementary
continuous metric we use the absolute percentage error
_APE_ = ��� _A_ _i_ _−A_ _i_ _F_ _i_ ��� _·_ 100%, where _A_ _i_ represents the actual value



_APE_ = ��� _A_ _i_ _−A_ _i_ _F_ _i_ ��� _·_ 100%, where _A_ _i_ represents the actual value

and _F_ _i_ the value provided by the SPICEAssistant. Due to the
presence of significant outliers in the _APE_ we use the median
of the _APE_ to avoid distortion. These strong outliers can occur
for example, when a design task aims for a 20 mV output
voltage ripple, but the result of the initial netlist is 120 mV,
leading to an _APE_ of 500% if the LLM fails with further
adjustments. Another reason to use the _APE_ is that the target
values of the design tasks have different orders of magnitude,
so using the absolute error _AE_ is not a viable option.
For the median _APE_, topology adaption questions are excluded since they can only be marked as correct or incorrect.
To receive a better statistical estimation of the performance
and to determine what constitutes a statistically significant
change in the performance metrics, we run the entire benchmarking process _n_ times, with _n_ = 40. This allows us to calculate the sample mean of the evaluation metrics and the corresponding confidence interval [36] with a significance level
of _α_ = 0 _._ 05. Due to limitations concerning the simulation
runtime, this more detailed statistical evaluation is performed
only for benchmark questions targeted on the simple circuit
type of the general buck converter.





_A_ _i_









_C. MAIN RESULTS_

The benchmarking is conducted for the following agent configurations: GPT-4o alone, GPT-4o combined with datasheet
interaction (GPT-4o + RAG), GPT-4o with simulation feedback (GPT-4o + SPICE), and finally, the complete SPICEAssistant, which integrates GPT-4o, SPICE, and RAG. The
benchmarking results are presented in Table 2.
SPICEAssistant significantly outperforms standalone GPT-4o
across the entire benchmark, increasing the solve rate by
approximately 38%. Moreover, the median _APE_ improves
remarkably from 64% to 4%. When examining the mean performance and confidence intervals for general buck converter
circuits, it is evident that the improvement is statistically
significant.
It can be observed that primary performance gain comes
from verifying the answers with LTSpice simulation feedback. When comparing approaches that utilize datasheet information via RAG to those that do not, we notice a slight improvement with RAG for the LTC3419 and LTC7802 circuits.
However, in the case of the general buck converter, GPT-4o



**FIGURE 7.** **The distribution of the** _APE_ **on the total benchmark shows**
**the effectiveness of the SPICE feedback, yet also reveals significant**
**outliers**


alone performs better than the combination of GPT-4o and
RAG. Also, there is no statistically significant difference
between GPT-4o + SPICE and GPT-4o + SPICE + RAG.

One reason for this could be, that there is much publicly
available information on the general buck converter, which
was likely included in GPT-4o’s training data, providing
GPT-4o with inherent knowledge about this circuit type. In
contrast, there are very limited public data on the LTC3419
and LTC7802, making the additional information provided
from RAG more crucial for these circuit types than for the
general buck converter.
Overall, it can be observed, that information extraction via

standard RAG from the technical datasheet does not con
tribute much to improve the performance. This aligns with the
findings in [16], where the authors applied RAG to complex
technical literature to enhance LLM’s knowledge for designing a multi-stage amplifier. Moreover, in another case study,
we benchmarked SPICEAssistant with an idealized RAG for

the general buck converter by manually extracting all relevant
datasheet information and putting it in the input prompt.
However, the results did not surpass those achieved with the
standard RAG. This suggests that the issue may not depend on
standard RAG’s information extraction capabilities, but rather
with GPT-4o’s ability to integrate all relevant information into
the required multi-step thinking process.


7


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



LLM Information



Information
LLM



You have the following SPICE netlist:

### medium level netlist ###

V1 IN 0 3.6

…

XU1 FB1 IN 0 SW1 IN SW2 IN FB2 0 LTC3419

…

Please adjust the netlist in order to select the pulseskipping mode. The 3. pin of the LTC3419 is
responsible for the mode.



Source



You have the following SPICE netlist:



Source



### hard level netlist ###


V1 RUN 0 25.7


…


R2 OUT2 Vfb2 457K


…


Adjust the netlist, such that the output voltage (OUT2)
takes the following value: 38 V. If necessary, set the
supply voltage to the maximum possible value. The
allowed tolerance is 1.9 V.











The circuit’s output voltage is 25.67 V. _(Tool Feedback)_


Despite adjusting the feedback resistor, the output
voltage remains below 38 V. Retrieve information about
maximal supply voltage from datasheet.


Input Voltage Range: 4.5V to 40V. _(RAG)_


The adapted netlist:

### hard level netlist ###

V1 RUN 0 40


…

R2 OUT2 Vfb2 1050K

…


The circuit’s output voltage is 38.01V. _(Tool Feedback)_


_LLM completed the conversation._


**FIGURE 8.** **Successful example of the interaction between LLM,**
**simulation tools and datasheet in the SPICEAssistant framework for a**
**parameter tuning benchmark question**


The performance of all tested approaches declines from the
general buck converter (easy) to the LTC3419 (medium) and
further to the LTC7802 (hard). Possible reasons for this trend

are:


_•_ A higher amount of publicly available data about the
general buck converter topology, compared to the specific controllers LTC3419 and LTC7802.

_•_ The LTC3419, and especially the LTC7802, have more
complex netlists with a greater diversity of components
and nodes, an increasing number of controller pins to
configure, etc. Therefore, these netlists are increasingly
more difficult to comprehend and give much more room
for mistakes compared to the significantly shorter netlist
of the general buck converter.

_•_ The complexity and number of different physical functions of the circuit, as well as the corresponding formulas, increase with the difficulty level.

Figure 7 shows a boxplot illustrating the distribution of
the _APE_ across the entire benchmark for all four tested

approaches. The boxplot depicts the range from the first
quartile (Q1) to the third quartile (Q3), with a line marking


8



LTC3419 is in Burst Mode. _(Tool Feedback)_


The adapted netlist:

### medium level netlist ###

V1 IN 0 3.6

…

XU1 FB1 IN MODE SW1 IN SW2 IN FB2 0 LTC3419

MODE IN 0

…


LTSpice simulation failed. _(Tool Feedback)_


_LLM stopped the conversation._


**FIGURE 9.** Unsuccessful example of the interaction between LLM,
simulation tools and datasheet in the SPICEAssistant framework for a
topology adaption benchmark question


the median. Whiskers extend from the edges of the box to
the most extreme data points that fall within 1.5 times the
interquartile range (IQR) starting from either end of the box

[37].
Notably, there are strong outliers in the _APE_, some of which
even exceed the image’s bounds and are truncated for the
readability. This is particularly the case for GPT-4o and
GPT-4o + RAG.

The boxplot further underlines that adding datasheet information via RAG does not substantially enhance performance,
confirming the above drawn conclusions.


To gain deeper insights into the qualitative behavior of
SPICEAssistant, we show two examples that illustrate the internal stepwise interactions between GPT-4o, the simulation
tools, and the datasheet via RAG.
Figure 8 shows a successful example where a feedback
resistor and supply voltage are correctly adjusted to achieve
the desired output voltage. In a first step, the LLM uses
RAG to extract the output voltage formula from the datasheet
and calculates a new feedback resistor value of 1050 kΩ,
highlighted in red in Figure 8. Although the formula suggests
1027.65 kΩ for an output of 38V, GPT-4o’s estimate is
close and would result in 38.8V. To verify, the LLM uses


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



the tool _get_mean_output_voltage()_, which returns 25.56V
due to insufficient supply voltage. GPT-4o then retrieves the
maximum input voltage for the LTC7802 from the datasheet,
updates the netlist, and after simulation verification, SPICEAssistant provides the adjusted netlist as the final output.
Figure 9 illustrates a design task where SPICEAssistant fails
to find the correct solution. To select pulse-skipping mode, the
mode pin (third pin in the netlist) should connect to the input
voltage node "IN." Initially, the mode pin is connected to
ground. The LLM first correctly uses the input node "IN" but
connects it to the wrong pin. In the next attempt, it renames
the third pin to "MODE" but uses incorrect SPICE syntax
while trying to connect that pin to "IN".
A possible reason for the struggle of SPICEAssistant to correctly connect controller pins may be the complex structure
and syntax of the SPICE netlist. The netlist line configuring
the pin connections of the controller is challenging to interpret
(XU1 FB1 IN 0 SW1 IN SW2 IN FB2 0 LTC3419).


In Section III-B the two question categories parameter
tuning and topology adaption where introduced. Figure 10
illustrates the solve rate of SPICEAssistant for these two

question categories across the three different circuit types.
For the LTC3419 and LTC7802, the performance on topology
adaption questions is significantly lower than for parameter tuning questions. However, for general buck converter
circuits, the performance on topology adaption questions is
approximately equal to, even slightly better than, that on
parameter tuning questions.
A possible reason for these observations might be a higher
amount of publicly available data, especially concerning
topology descriptions in the form of netlists, about the general
buck converter compared to the specific controllers LTC3419
and LTC7802.

A general issue might also be the disadvantageous semantic
structure of SPICE netlists. This problem is also recognized
in related works. In an attempt to improve the semantic
structure, the authors in [38] and [39] propose their own individual textual circuit representations, while in [14] the authors



|Col1|Col2|Col3|Col4|Col5|
|---|---|---|---|---|
||||||
||||||
||||||
||||||
||||||
||||||
||||General Buck<br>LTC3419<br>|Converter|
||||~~LTC7802~~<br>Total||
||||||


**FIGURE 11.** **Performance of SPICEAssistant over the number of tool**

**iterations**


In Figure 11 the interaction of the LLM with its simulation
tools is analyzed. The performance measured by the solve rate
is shown over the number of iterations in SPICEAssistant.

The solve rate increases with the number of iterations until it

reaches a plateau after five iterations. To conclude, repeated



utilize the PySpice library to represent the circuits within
Python. In SPICE netlists, the circuit topology is encoded in a
tabular format rather than being described in a language-like
semantic structure. For instance, the line "R1 SW N01 10k"
stands for the resistor R1 being connected to the nodes SW
and N01. Furthermore, the semantic representation of the
components functionality is weak. For example, the naming
of the nodes in the circuit is arbitrary. In the SPICE netlist
line above, the node name SW indicates that this is the
switching node, which plays a central role in every buck
converter, but the node name N01 provides no indication
of its functionality. These shortcomings and the need for
improvement in topology adaption design tasks may serve
as starting point of future research in this area.











**FIGURE 10.** Performance of SPICEAssistant on different question categories and circuit types



9


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies



simulation feedback significantly increases the design abilities of LLMs on SMPS circuits, yet they are still limited
when it comes to sophisticated multi-step design tasks with
complex netlists and topology adaption tasks.


**V. CONCLUSION**

This paper presents SPICEAssistant, a framework that equips
an LLM with a broad selection of tools, which enable flexible
interaction with a SPICE simulation environment for SMPS

design. This allows the LLM to correctly interpret the impact
of its modifications to SMPS circuits and to verify its answers
with the received feedback. We defined a benchmark consisting of 256 questions testing the ability to adapt circuit SPICE
netlists to fulfill different design tasks. The benchmarking
shows that SPICEAssistant significantly enhances the ability of LLMs to understand, adapt, and dimension electronic
circuits, with performance increasing by approximately 38%
compared to standalone GPT-4o. Through interactions with
the SPICE simulation tools, the LLM is enabled to follow a
multi-step design process, which is often involved in SMPS
development. The frameworks performance improves with an
increasing number of simulation iterations. While SPICEAssistant generally performs well on parameter tuning tasks, its
capability in topology adaption tasks for circuits with higher
complexity is still limited. In conclusion, SPICEAssistant
presents a promising approach to increase the usability of
LLMs in EDA. Possible future research could address an

evaluation of different text-based circuit representations to
improve the performance on topology adaption tasks.


**REFERENCES**


[1] X. Hou, Y. Zhao, Y. Liu, Z. Yang, K. Wang, L. Li, X. Luo, D. Lo, J. Grundy,
and H. Wang, ‘‘Large language models for software engineering: A systematic literature review,’’ _ACM Transactions on Software Engineering and_
_Methodology_, vol. 33, no. 8, pp. 1–79, 2024.

[2] J. Blocklove, S. Garg, R. Karri, and H. Pearce, ‘‘Chip-chat: Challenges and
opportunities in conversational hardware design,’’ in _2023 ACM/IEEE 5th_
_Workshop on Machine Learning for CAD (MLCAD)_, pp. 1–6, IEEE, 2023.

[3] K. Chang, Y. Wang, H. Ren, M. Wang, S. Liang, Y. Han, H. Li, and X. Li,
‘‘Chipgpt: How far are we from natural language hardware design,’’ _arXiv_
_preprint arXiv:2305.14019_, 2023.

[4] S. Thakur, B. Ahmad, H. Pearce, B. Tan, B. Dolan-Gavitt, R. Karri, and
S. Garg, ‘‘Verigen: A large language model for verilog code generation,’’
_ACM Transactions on Design Automation of Electronic Systems_, vol. 29,
no. 3, pp. 1–31, 2024.

[5] S. Thakur, J. Blocklove, H. Pearce, B. Tan, S. Garg, and R. Karri, ‘‘Autochip: Automating hdl generation using llm feedback,’’ _arXiv preprint_
_arXiv:2311.04887_, 2023.

[6] M. Liu, N. Pinckney, B. Khailany, and H. Ren, ‘‘Verilogeval: Evaluating
large language models for verilog code generation,’’ in _2023 IEEE/ACM_
_International Conference on Computer Aided Design (ICCAD)_, pp. 1–8,
IEEE, 2023.

[7] Y. Tsai, M. Liu, and H. Ren, ‘‘Rtlfixer: Automatically fixing rtl syntax
errors with large language model,’’ in _Proceedings of the 61st ACM/IEEE_
_Design Automation Conference_, pp. 1–6, 2024.

[8] Y. Lu, S. Liu, Q. Zhang, and Z. Xie, ‘‘Rtllm: An open-source benchmark
for design rtl generation with large language model,’’ in _2024 29th Asia_
_and South Pacific Design Automation Conference (ASP-DAC)_, pp. 722–
727, IEEE, 2024.

[9] Y. Fu, Y. Zhang, Z. Yu, S. Li, Z. Ye, C. Li, C. Wan, and Y. C. Lin,
‘‘Gpt4aigchip: Towards next-generation ai accelerator design automation
via large language models,’’ in _2023 IEEE/ACM International Conference_
_on Computer Aided Design (ICCAD)_, pp. 1–9, IEEE, 2023.


10




[10] S. Liu, W. Fang, Y. Lu, J. Wang, Q. Zhang, H. Zhang, and Z. Xie, ‘‘Rtlcoder:
Fully open-source and efficient llm-assisted rtl code generation technique,’’
_IEEE Transactions on Computer-Aided Design of Integrated Circuits and_
_Systems_, vol. 44, no. 4, pp. 1448–1461, 2025.

[11] D. Guo, Q. Zhu, D. Yang, Z. Xie, K. Dong, W. Zhang, G. Chen,
X. Bi, Y. Wu, Y. Li, _et al._, ‘‘Deepseek-coder: When the large language
model meets programming–the rise of code intelligence,’’ _arXiv preprint_
_arXiv:2401.14196_, 2024.

[12] ‘‘The spice book,’’ 1994.

[13] D. Vungarala, S. Alam, A. Ghosh, and S. Angizi, ‘‘Spicepilot: Navigating
spice code generation and simulation with ai guidance,’’ _arXiv preprint_
_arXiv:2410.20553_, 2024.

[14] Y. Lai, S. Lee, G. Chen, S. Poddar, M. Hu, D. Z. Pan, and P. Luo,
‘‘Analogcoder: Analog circuit design via training-free code generation,’’
_arXiv preprint arXiv:2405.14918_, 2024.

[15] C. Liu, Y. Liu, Y. Du, and L. Du, ‘‘Ladac: Large language model-driven
auto-designer for analog circuits,’’ _Authorea Preprints_, 2024.

[16] C. Liu, W. Chen, A. Peng, Y. Du, L. Du, and J. Yang, ‘‘Ampagent:
An llm-based multi-agent system for multi-stage amplifier schematic design from literature for process and performance porting,’’ _arXiv preprint_
_arXiv:2409.14739_, 2024.

[17] D. V. Kochar, H. Wang, A. Chandrakasan, and X. Zhang, ‘‘Ledro: Llmenhanced design space reduction and optimization for analog circuits,’’
_arXiv preprint arXiv:2411.12930_, 2024.

[18] H. Jin, J. Wang, J. Sheng, Y. Wu, J. Chen, Y. Wang, and J. Liu, ‘‘Wiseeda:
Llms in rf circuit design,’’ _Microelectronics Journal_, p. 106607, 2025.

[19] Y. Wu, X. Yu, H. Chen, Y. Luo, Y. Tong, and Y. Ma, ‘‘Picbench: Benchmarking llms for photonic integrated circuits design,’’ _arXiv preprint_
_arXiv:2502.03159_, 2025.

[20] Z. Tao, Y. Shi, Y. Huo, R. Ye, Z. Li, L. Huang, C. Wu, N. Bai, Z. Yu, T.-J.
Lin, _et al._, ‘‘Amsnet: Netlist dataset for ams circuits,’’ in _2024 IEEE LLM_
_Aided Design Workshop (LAD)_, pp. 1–5, IEEE, 2024.

[21] Y. Shi, Z. Tao, Y. Gao, T. Zhou, C. Chang, Y. Wang, B. Chen, G. Zhang,
A. Liu, Z. Yu, _et al._, ‘‘Amsnet-kg: A netlist dataset for llm-based
ams circuit auto-design using knowledge graph rag,’’ _arXiv preprint_
_arXiv:2411.13560_, 2024.

[22] J. Bhandari, V. Bhat, Y. He, S. Garg, H. Rahmani, and R. Karri, ‘‘Masalachai: A large-scale spice netlist dataset for analog circuits by harnessing
ai,’’ 2025.

[23] Z. Gou, Z. Shao, Y. Gong, Y. Shen, Y. Yang, N. Duan, and W. Chen, ‘‘Critic:
Large language models can self-correct with tool-interactive critiquing,’’
_arXiv preprint arXiv:2305.11738_, 2023.

[24] S. Tonmoy, S. Zaman, V. Jain, A. Rani, V. Rawte, A. Chadha, and A. Das,
‘‘A comprehensive survey of hallucination mitigation techniques in large
language models,’’ _arXiv preprint arXiv:2401.01313_, vol. 6, 2024.

[25] Y. Zhang, Y. Li, L. Cui, D. Cai, L. Liu, T. Fu, X. Huang, E. Zhao, Y. Zhang,
Y. Chen, _et al._, ‘‘Siren’s song in the ai ocean: a survey on hallucination in
large language models,’’ _arXiv preprint arXiv:2309.01219_, 2023.

[26] L. Huang, W. Yu, W. Ma, W. Zhong, Z. Feng, H. Wang, Q. Chen, W. Peng,
X. Feng, B. Qin, _et al._, ‘‘A survey on hallucination in large language
models: Principles, taxonomy, challenges, and open questions,’’ _ACM_
_Transactions on Information Systems_, vol. 43, no. 2, pp. 1–55, 2025.

[27] P. Lewis, E. Perez, A. Piktus, F. Petroni, V. Karpukhin, N. Goyal, H. Küttler,
M. Lewis, W.-t. Yih, T. Rocktäschel, _et al._, ‘‘Retrieval-augmented generation for knowledge-intensive nlp tasks,’’ _Advances in neural information_
_processing systems_, vol. 33, pp. 9459–9474, 2020.

[28] T. Instruments, ‘‘Understanding buck power stages in switchmode power
supplies - application report,’’ 1999.

[29] T. Kojima, S. S. Gu, M. Reid, Y. Matsuo, and Y. Iwasawa, ‘‘Large language
models are zero-shot reasoners,’’ _Advances in neural information process-_
_ing systems_, vol. 35, pp. 22199–22213, 2022.

[30] ‘‘Ltc3419 product information and datasheet,
https://www.analog.com/en/products/ltc3419.html,’’ 04.2025.

[31] ‘‘Ltc7802 product information and datasheet,
https://www.analog.com/en/products/ltc7802.html,’’ 04.2025.

[32] ‘‘Azure openai rest api, https://learn.microsoft.com/en-us/azure/aiservices/openai/reference,’’ last access on 04.2025.

[33] ‘‘Azure openai api file search tool, https://learn.microsoft.com/enus/azure/ai-services/openai/how-to/file-search?tabs=python,’’ last access
on 04.2025.

[34] ‘‘text-embedding-3-large, https://openai.com/index/new-embeddingmodels-and-api-updates/,’’ last access on 04.2025.

[35] ‘‘Ltspice, https://www.analog.com/en/resources/design-tools-andcalculators/ltspice-simulator.html,’’ 02.2025.


S. Nau _et al._ : SPICEAssistant: LLM using SPICE Simulation Tools for Schematic Design of Switched-Mode Power Supplies


[36] Heumann, Schomaker, and Shalabh, ‘‘Introduction to statistics and data
analysis,’’ pp. 206–207, 2022.

[37] ‘‘matplotlib boxplot, https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.boxplot.html,’’ 04.2025.

[38] J. Gao, W. Cao, J. Yang, and X. Zhang, ‘‘Analoggenie: A generative engine for automatic discovery of analog circuit topologies,’’ _arXiv preprint_
_arXiv:2503.00205_, 2025.

[39] Z. Chen, J. Huang, Y. Liu, F. Yang, L. Shang, D. Zhou, and X. Zeng,
‘‘Artisan: Automated operational amplifier design via domain-specific
large language model,’’ in _Proceedings of the 61st ACM/IEEE Design_
_Automation Conference_, pp. 1–6, 2024.



11


