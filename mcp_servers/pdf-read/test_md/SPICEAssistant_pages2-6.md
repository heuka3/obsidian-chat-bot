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

