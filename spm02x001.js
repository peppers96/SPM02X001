const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const e = exposes.presets;
const ea = exposes.access;
const {
    precisionRound, calibrateAndPrecisionRoundOptions, postfixWithEndpointName,
} = require('zigbee-herdsman-converters/lib/utils');
const utils = require('zigbee-herdsman-converters/lib/utils');

let preEnergy = 0;
let preProduced_energy = 0;

const converters = {
    seMetering: {

        cluster: 'seMetering',
        type: ['attributeReport', 'readResponse'],
        options: (definition) => {
            const result = [];
            if (definition.exposes.find((e) => e.name === 'produced_energy')) {
                result.push(exposes.options.precision('produced_energy'), exposes.options.calibration('energy', 'percentual'));
            }
            return result;

        },

        convert: (model, msg, publish, options, meta) => {
            if (utils.hasAlreadyProcessedMessage(msg, model)) return;
            const payload = {};
            const multiplier = msg.endpoint.getClusterAttributeValue('seMetering', 'multiplier');
            const divisor = msg.endpoint.getClusterAttributeValue('seMetering', 'divisor');
            const factor = multiplier && divisor ? multiplier / divisor : null;


            if (factor != null && (msg.data.hasOwnProperty('currentSummDelivered') ||
                msg.data.hasOwnProperty('currentSummReceived'))) {
                let energy  = preEnergy;
                let produced_energy  = preProduced_energy;
                if (msg.data.hasOwnProperty('currentSummDelivered')) {
                    const data = msg.data['currentSummDelivered'];
                    const value = (parseInt(data[0]) << 32) + parseInt(data[1]);
                    energy = value * factor;
                    preEnergy = energy;
                }
                if (msg.data.hasOwnProperty('currentSummReceived'))  {
                    const data = msg.data['currentSummReceived'];
                    const value = (parseInt(data[0]) << 32) + parseInt(data[1]);
                    produced_energy = value * factor;
                    preProduced_energy = produced_energy;
                }
                payload.energy = calibrateAndPrecisionRoundOptions(energy, options, 'energy');
                payload.produced_energy = calibrateAndPrecisionRoundOptions(produced_energy, options, 'energy');
                //payload.energy = energy;
                //payload.produced_energy = produced_energy;
            }
            return payload;
        },
    },
    electrical_measurement_bituo: {
        //bituo-SPM02
        cluster: 'haElectricalMeasurement',
        type: ['attributeReport', 'readResponse'],
        options: [
            exposes.options.precision('ac_frequency'),
            exposes.options.calibration('power_phase_a', 'percentual'), exposes.options.precision('power_phase_a'),
            exposes.options.calibration('voltage_phase_a', 'percentual'), exposes.options.precision('voltage_phase_a'),
            exposes.options.calibration('current_phase_a', 'percentual'), exposes.options.precision('current_phase_a'),
        ],
        convert: (model, msg, publish, options, meta) => {
            if (utils.hasAlreadyProcessedMessage(msg, model)) return;
            const getFactor = (key) => {
                const multiplier = msg.endpoint.getClusterAttributeValue('haElectricalMeasurement', `${key}Multiplier`);
                const divisor = msg.endpoint.getClusterAttributeValue('haElectricalMeasurement', `${key}Divisor`);
                const factor = multiplier && divisor ? multiplier / divisor : 1;
                return factor;
            };

            const lookup = [
                {key: 'activePower', name: 'power_phase_a', factor: 'acPower'},
                {key: 'activePowerPhB', name: 'power_phase_b', factor: 'acPower'},
                {key: 'activePowerPhC', name: 'power_phase_c', factor: 'acPower'},
                {key: 'totalActivePower', name: 'power', factor: 'acPower'},
                {key: 'apparentPower', name: 'power_apparent_phase_a', factor: 'acPower'},
                {key: 'apparentPowerPhB', name: 'power_apparent_phase_b', factor: 'acPower'},
                {key: 'apparentPowerPhC', name: 'power_apparent_phase_c', factor: 'acPower'},
                {key: 'totalApparentPower', name: 'power_apparent', factor: 'acPower'},
                {key: 'reactivePower', name: 'power_reactive_phase_a', factor: 'acPower'},
                {key: 'reactivePowerPhB', name: 'power_reactive_phase_b', factor: 'acPower'},
                {key: 'reactivePowerPhC', name: 'power_reactive_phase_c', factor: 'acPower'},
                {key: 'totalReactivePower', name: 'power_reactive', factor: 'acPower'},
                {key: 'rmsCurrent', name: 'current', factor: 'acCurrent'},
                {key: 'rmsCurrentPhB', name: 'current_phase_b', factor: 'acCurrent'},
                {key: 'rmsCurrentPhC', name: 'current_phase_c', factor: 'acCurrent'},
                {key: 'rmsVoltage', name: 'voltage', factor: 'acVoltage'},
                {key: 'rmsVoltagePhB', name: 'voltage_phase_b', factor: 'acVoltage'},
                {key: 'rmsVoltagePhC', name: 'voltage_phase_c', factor: 'acVoltage'},
                {key: 'acFrequency', name: 'ac_frequency', factor: 'acFrequency'},
            ];

            const payload = {};
            for (const entry of lookup) {
                if (msg.data.hasOwnProperty(entry.key)) {
                    const factor = getFactor(entry.factor);
                    const property = postfixWithEndpointName(entry.name, msg, model, meta);
                    const value = msg.data[entry.key] * factor;
                    payload[property] = calibrateAndPrecisionRoundOptions(value, options, entry.name);
                    //payload[property] = value;
                }
            }

            // alarm mask
            if(msg.data.hasOwnProperty('ACAlarmsMask')){
                payload.Alarm = msg.data['ACAlarmsMask'].toString(2);
            }

            if (msg.data.hasOwnProperty('powerFactor')) {
                payload.power_factor = precisionRound(msg.data['powerFactor'] / 100 , 2);
            }
            if (msg.data.hasOwnProperty('powerFactorPhB')) {
                payload.power_factor_phase_b = precisionRound(msg.data['powerFactorPhB'] / 100 , 2);
            }
            if (msg.data.hasOwnProperty('powerFactorPhC')) {
                payload.power_factor_phase_c = precisionRound(msg.data['powerFactorPhC'] / 100 , 2);
            }
            return payload;
        },
    }
}

const definition = {
    zigbeeModel: ['SPM02X001'],
    model: 'SPM02X001',
    vendor: 'BITUO TECHNIK',
    description: 'Smart energy monitor for 3P+N system',
    fromZigbee: [converters.electrical_measurement_bituo, converters.seMetering],
    toZigbee: [],
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        await reporting.bind(endpoint, coordinatorEndpoint, ['haElectricalMeasurement', 'seMetering']);
        //await reporting.readEletricalMeasurementMultiplierDivisors(endpoint);
        await reporting.readMeteringMultiplierDivisor(endpoint);
        await endpoint.read('haElectricalMeasurement', ['acVoltageMultiplier', 'acVoltageDivisor']);
        await endpoint.read('haElectricalMeasurement', ['acCurrentMultiplier', 'acCurrentDivisor']);
        await endpoint.read('haElectricalMeasurement', ['acFrequencyMultiplier', 'acFrequencyDivisor']);
        await endpoint.saveClusterAttributeKeyValue('haElectricalMeasurement', {acPowerMultiplier: 1, acPowerDivisor: 1});
    },
    exposes:  [
        e.power(),
        e.numeric('power_phase_a', ea.STATE).withUnit('W').withDescription('Instantaneous measured power on phase A'),
        e.numeric('power_phase_b', ea.STATE).withUnit('W').withDescription('Instantaneous measured power on phase B'),
        e.numeric('power_phase_c', ea.STATE).withUnit('W').withDescription('Instantaneous measured power on phase C'),
        e.numeric('voltage', ea.STATE).withLabel('Voltage phase A').withUnit('V').withDescription('Measured electrical potential value on phase A'),
        e.numeric('voltage_phase_b', ea.STATE).withLabel('Voltage phase B').withUnit('V').withDescription('Measured electrical potential value on phase B'),
        e.numeric('voltage_phase_c', ea.STATE).withLabel('Voltage phase C').withUnit('V').withDescription('Measured electrical potential value on phase C'),
        e.ac_frequency(),
        e.numeric('current', ea.STATE).withLabel('Current phase A').withUnit('A').withDescription('Instantaneous measured electrical current on phase A'),
        e.numeric('current_phase_b', ea.STATE).withLabel('Current phase B').withUnit('A').withDescription('Instantaneous measured electrical current on phase B'),
        e.numeric('current_phase_c', ea.STATE).withLabel('Current phase C').withUnit('A').withDescription('Instantaneous measured electrical current on phase C'),
        e.numeric('power_factor', ea.STATE).withUnit('pf').withDescription('Instantaneous measured power factor on phase A'),
        e.numeric('power_factor_phase_b', ea.STATE).withUnit('pf').withDescription('Instantaneous measured power factor on phase B'),
        e.numeric('power_factor_phase_c', ea.STATE).withUnit('pf').withDescription('Instantaneous measured power factor on phase C'),

        e.power_reactive(),
        e.numeric('power_reactive_phase_a', ea.STATE).withUnit('VAR').withDescription('Instantaneous measured reactive power on phase A'),
        e.numeric('power_reactive_phase_b', ea.STATE).withUnit('VAR').withDescription('Instantaneous measured reactive power on phase B'),
        e.numeric('power_reactive_phase_c', ea.STATE).withUnit('VAR').withDescription('Instantaneous measured reactive power on phase C'),
        
        e.power_apparent(),
        e.numeric('power_apparent_phase_a', ea.STATE).withUnit('VA').withDescription('Instantaneous measured apparent power on phase A'),
        e.numeric('power_apparent_phase_b', ea.STATE).withUnit('VA').withDescription('Instantaneous measured apparent power on phase B'),
        e.numeric('power_apparent_phase_c', ea.STATE).withUnit('VA').withDescription('Instantaneous measured apparent power on phase C'),

        e.energy(),
        e.produced_energy(),
    ],
};

module.exports = definition;
