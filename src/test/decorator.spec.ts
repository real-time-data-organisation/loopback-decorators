import * as chai from 'chai';
import { expect } from 'chai';
import * as promised from 'chai-as-promised';
import { RemoteMethodModule } from '../';

chai.use(promised);

const loopback = require('loopback');

describe('@RemoteMethodModule Decorator', () => {
  context('proxyFor', () => {
    let internalModel: any;
    let externalModel: any;
    let instance: any;
    let decorated;
    before('Configure proxy', () => {
      const app = loopback();
      internalModel = loopback.Model.extend(
        `Internal${Date.now()}`,
        { prop: 'string' },
        {}
      );
      externalModel = loopback.Model.extend(
        `External${Date.now()}`,
        {},
        { idInjection: false, forceId: false }
      );
      let memory = loopback.memory();
      internalModel.attachTo(memory);
      externalModel.attachTo(memory);
      app.model(internalModel);
      app.model(externalModel);

      @RemoteMethodModule({
        proxyFor: internalModel.modelName,
        proxyMethods: ['findById', 'prototype.updateAttributes'],
      })
      class ModelClass {
        constructor(public model: any) {}
      }

      decorated = new ModelClass(externalModel);
      app.emit('booted');
    });

    before('Create instances', async () => {
      instance = await internalModel.create({ prop: 'hello' });
    });

    it('proxies a static method to a target internal model', async () => {
      let loaded = await externalModel.findById(instance.id);
      expect(loaded).to.be.ok;
      expect(loaded).to.have.property('prop', 'hello');
      expect(loaded).to.be.instanceOf(internalModel);
    });

    it('proxies an instance method to a target internal model', async () => {
      // create an external model instance that will have the same id as the internal one
      let model = await externalModel.create();
      // save some changes which should trigger the save on the internal we proxy for
      let updated = await model.updateAttributes({ prop: 'goodbye' });
      instance = await instance.reload();
      expect(instance).to.have.property('prop', 'goodbye');
    });
  });

  context('strictProxy', () => {
    let internalModel: any, externalModel: any, decorated: any, instance: any;
    before('Configure proxy', () => {
      const app = loopback();
      internalModel = loopback.Model.extend(
        `Internal${Date.now()}`,
        { secret: 'string', prop: 'string' },
        {}
      );
      externalModel = loopback.Model.extend(
        `External${Date.now()}`,
        { prop: 'string' },
        { strict: true, idInjection: false, forceId: false }
      );
      let memory = loopback.memory();
      internalModel.attachTo(memory);
      externalModel.attachTo(memory);
      app.model(internalModel);
      app.model(externalModel);

      @RemoteMethodModule({
        proxyFor: internalModel.modelName,
        strict: true,
        proxyMethods: [
          'find',
          'findById',
          'create',
          'prototype.updateAttributes',
        ],
      })
      class ModelClass {
        constructor(public model: any) {}
      }

      decorated = new ModelClass(externalModel);
      app.emit('booted');
    });

    before('Create instances', async () => {
      instance = await internalModel.create({ prop: 'hello' });
    });

    it('proxies findById to another model returning an instance of the proxy', async () => {
      let result = await externalModel.findById(instance.id);
      expect(result).to.be.an.instanceof(externalModel);
      expect(result).to.have.property('prop', 'hello');
      expect(result).not.to.have.property('secret');
    });
    it('proxies findById to another model returning an instance of the proxy using callback', done => {
      externalModel.findById(instance.id, (err: any, result: any) => {
        expect(result).to.be.an.instanceof(externalModel);
        expect(result).to.have.property('prop', 'hello');
        expect(result).not.to.have.property('secret');
        done(err);
      });
    });
    it('proxies find to another model returning an instance of the proxy', async () => {
      let result = await externalModel.find();
      expect(result).to.be.an('array');
      let item = result[0];
      expect(item).to.be.an.instanceof(externalModel);
      expect(item).to.have.property('prop', 'hello');
      expect(item).not.to.have.property('secret');
    });
    it('proxies find to another model returning an instance of the proxy using callback', done => {
      externalModel.find((err: any, result: any) => {
        expect(result).to.be.an('array');
        let item = result[0];
        expect(item).to.be.an.instanceof(externalModel);
        expect(item).to.have.property('prop', 'hello');
        expect(item).not.to.have.property('secret');
        done(err);
      });
    });
    it('proxies writes to the underlying model', async () => {
      let result = await externalModel.findById(instance.id);
      await result.updateAttributes({ prop: 'hi' });
      let updated = await internalModel.findById(instance.id);
      expect(updated).to.have.property('prop', 'hi');
    });
    it('proxies creation to the underlying model', async () => {
      let inst = await externalModel.create({ prop: 'greetings' });
      let updated = await internalModel.findById(inst.id);
      expect(updated).to.have.property('prop', 'greetings');
    });
  });

  context('Error Handling', () => {
    let internalModel: any, externalModel: any, decorated: any, instance: any;
    before('Configure proxy', () => {
      const app = loopback();
      internalModel = loopback.Model.extend(
        `Internal${Date.now()}`,
        { secret: 'string', prop: 'string' },
        {}
      );
      internalModel.throwAnErrorMethod = function(cb?: Function) {
        if (cb) {
          return cb(new Error('Error from the internal model'));
        } else {
          return Promise.reject(new Error('Error from the internal model'));
        }
      };
      externalModel = loopback.Model.extend(
        `External${Date.now()}`,
        { prop: 'string' },
        { strict: true, idInjection: false, forceId: false }
      );
      let memory = loopback.memory();
      internalModel.attachTo(memory);
      externalModel.attachTo(memory);
      app.model(internalModel);
      app.model(externalModel);

      @RemoteMethodModule({
        proxyFor: internalModel.modelName,
        strict: true,
        proxyMethods: ['throwAnErrorMethod'],
      })
      class ModelClass {
        constructor(public model: any) {}
      }

      decorated = new ModelClass(externalModel);
      app.emit('booted');
    });

    it('proxies error', async () => {
      await expect(
        externalModel.throwAnErrorMethod()
      ).to.eventually.be.rejectedWith(Error, 'Error from the internal model');
    });
    it('proxies error using callback', done => {
      externalModel.throwAnErrorMethod((err: any, result: any) => {
        expect(err.message).to.equal('Error from the internal model');
        done(result);
      });
    });
  });
});
